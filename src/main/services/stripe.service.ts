import Stripe from 'stripe';
import { supabase } from '../lib/supabase';
import { systemSettingsService } from './settings.service';

export class StripeService {
    private stripe: Stripe | null = null;
    private initialized = false;

    private async ensureInitialized() {
        if (this.initialized && this.stripe) return;

        const config = await systemSettingsService.getStripeConfig();
        const secretKey = config.secretKey;

        if (secretKey) {
            this.stripe = new Stripe(secretKey, {
                apiVersion: '2024-12-18.acacia' as any,
            });
            this.initialized = true;
        } else {
            console.warn('[StripeService] STRIPE_SECRET_KEY not found in system settings or environment.');
        }
    }

    /**
     * Create a PaymentIntent for one-time purchases (Credits)
     */
    async createPaymentIntent(amount: number, currency: string = 'usd', metadata: any = {}, customerId?: string) {
        await this.ensureInitialized();
        console.log('[StripeService] Creating PaymentIntent:', { amount, currency, customerId, hasMetadata: !!metadata });
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount,
                currency,
                metadata,
                customer: customerId,
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            return {
                clientSecret: paymentIntent.client_secret,
                id: paymentIntent.id,
            };
        } catch (error: any) {
            console.error('[StripeService] Create PaymentIntent failed:', error);
            throw error;
        }
    }

    async fulfillPaymentIntent(paymentIntentId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');

        try {
            const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.status !== 'succeeded') {
                return { success: false, message: 'Payment not succeeded' };
            }

            // Check if already processed
            if (paymentIntent.metadata.fulfilled === 'true') {
                return { success: true, message: 'Already fulfilled' };
            }

            const userId = paymentIntent.metadata.userId;
            const credits = parseInt(paymentIntent.metadata.credits || '0');
            const type = paymentIntent.metadata.type;

            if (!userId) {
                return { success: false, message: 'No userId in metadata' };
            }

            if (type !== 'credit_purchase') {
                return { success: true, message: 'Payment verified, but no credits to add' };
            }

            if (credits <= 0) {
                return { success: false, message: 'Invalid credit amount' };
            }

            // Update database - fetching current balance first
            const { data: balanceData, error: fetchError } = await supabase
                .from('credit_balances')
                .select('balance')
                .eq('user_id', userId)
                .maybeSingle();

            if (fetchError) throw fetchError;

            const newBalance = (balanceData?.balance || 0) + credits;

            const { error: updateError } = await supabase
                .from('credit_balances')
                .upsert({
                    user_id: userId,
                    balance: newBalance,
                    updated_at: new Date().toISOString()
                });

            if (updateError) throw updateError;

            // Mark as fulfilled in Stripe metadata
            await this.stripe.paymentIntents.update(paymentIntentId, {
                metadata: { fulfilled: 'true' }
            });

            return { success: true, balance: newBalance };
        } catch (error: any) {
            console.error('[StripeService] Fulfill PaymentIntent failed:', error);
            throw error;
        }
    }

    /**
     * Create a Subscription
     */
    async createSubscription(customerId: string, priceId: string, promoCode?: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');

        try {
            let promoCodeId: string | undefined;

            if (promoCode) {
                const promoCodes = await this.stripe.promotionCodes.list({
                    code: promoCode,
                    active: true,
                    limit: 1,
                });

                if (promoCodes.data.length > 0) {
                    promoCodeId = promoCodes.data[0].id;
                } else {
                    throw new Error('Invalid or expired promotion code');
                }
            }

            // 1. Create the subscription with deep expansion
            // This expansion helps see the discount on the latest_invoice immediately.
            const subscription = await this.stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                discounts: promoCodeId ? [{ promotion_code: promoCodeId }] : undefined,
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                expand: [
                    'latest_invoice.payment_intent',
                    'latest_invoice.total_discount_amounts'
                ],
            });

            let invoice = subscription.latest_invoice as any;

            // Log current state for debugging
            console.log('[StripeService] Initial checkout invoice:', {
                id: invoice?.id,
                subtotal: invoice?.subtotal,
                total: invoice?.total,
                amount_due: invoice?.amount_due,
                discount_amounts: invoice?.total_discount_amounts
            });

            // If we have a promo code, Stripe sometimes takes a moment to "finalize" the invoice.
            // We want to return the version of the invoice that actually has the discount.
            if (promoCodeId && invoice && typeof invoice !== 'string') {
                // If it looks like the discount hasn't been applied yet (total == subtotal)
                // OR if total_discount_amounts is empty, we fetch again.
                if (invoice.total === invoice.subtotal || !invoice.total_discount_amounts?.length) {
                    try {
                        console.log('[StripeService] Discount not visible yet, waiting for settlement...');
                        // 800ms is a safe window for the Stripe billing engine to process the coupon
                        await new Promise(r => setTimeout(r, 800));

                        const fresh = await this.stripe.invoices.retrieve(invoice.id, {
                            expand: ['payment_intent', 'total_discount_amounts']
                        });

                        if (fresh) {
                            invoice = fresh;
                            console.log('[StripeService] Settled invoice data:', {
                                subtotal: invoice.subtotal,
                                total: invoice.total,
                                amount_due: invoice.amount_due,
                                discount_amounts: invoice.total_discount_amounts
                            });
                        }
                    } catch (e) {
                        console.warn('[StripeService] Error fetching settled invoice:', e);
                    }
                }
            }

            const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent | null;

            return {
                subscriptionId: subscription.id,
                clientSecret: paymentIntent?.client_secret || null,
                amount: typeof invoice?.amount_due === 'number' ? invoice.amount_due : (invoice?.total ?? 4999),
                subtotal: typeof invoice?.subtotal === 'number' ? invoice.subtotal : 4999,
                currency: invoice?.currency || 'usd',
            };
        } catch (error: any) {
            console.error('[StripeService] Create Subscription failed:', error);

            const rawMessage = error.raw?.message || error.message;

            if (rawMessage.includes('prior transactions')) {
                throw new Error('This code is only for new customers. You have prior transactions on your account.');
            }
            if (rawMessage.includes('Invalid or expired')) {
                throw new Error('This promo code is invalid or has expired.');
            }

            // Catch-all for other Stripe errors to keep them clean
            throw new Error(rawMessage);
        }
    }

    /**
     * Helper to create a customer if one doesn't exist.
     */
    async createCustomer(email: string, name?: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');

        try {
            // Check if customer exists
            const existing = await this.stripe.customers.search({
                query: `email:'${email}'`,
                limit: 1
            });

            if (existing.data.length > 0) {
                return existing.data[0];
            }

            return await this.stripe.customers.create({
                email,
                name,
            });
        } catch (error: any) {
            console.error('[StripeService] Create Customer failed:', error);
            throw error;
        }
    }

    /**
     * Create a Billing Portal Session
     */
    async createPortalSession(customerId: string, returnUrl: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return { url: session.url };
        } catch (error: any) {
            console.error('[StripeService] Create Portal Session failed:', error);
            throw error;
        }
    }

    /**
     * Native Management Methods
     */
    async getInvoices(customerId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const invoices = await this.stripe.invoices.list({
                customer: customerId,
                limit: 10,
            });
            return invoices.data;
        } catch (error: any) {
            console.error('[StripeService] Get Invoices failed:', error);
            throw error;
        }
    }

    async getPaymentMethods(customerId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const paymentMethods = await this.stripe.paymentMethods.list({
                customer: customerId,
                type: 'card',
            });
            return paymentMethods.data;
        } catch (error: any) {
            console.error('[StripeService] Get Payment Methods failed:', error);
            throw error;
        }
    }

    async updateSubscription(subscriptionId: string, params: Stripe.SubscriptionUpdateParams) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const subscription = await this.stripe.subscriptions.update(subscriptionId, params);
            return subscription;
        } catch (error: any) {
            console.error('[StripeService] Update Subscription failed:', error);
            throw error;
        }
    }

    async cancelSubscription(subscriptionId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            // Immediate cancellation
            const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
            return subscription;
        } catch (error: any) {
            console.error('[StripeService] Cancel Subscription failed:', error);
            throw error;
        }
    }

    async createSetupIntent(customerId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const setupIntent = await this.stripe.setupIntents.create({
                customer: customerId,
                payment_method_types: ['card'],
            });
            return { clientSecret: setupIntent.client_secret };
        } catch (error: any) {
            console.error('[StripeService] Create SetupIntent failed:', error);
            throw error;
        }
    }

    async deletePaymentMethod(paymentMethodId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            await this.stripe.paymentMethods.detach(paymentMethodId);
            return { success: true };
        } catch (error: any) {
            console.error('[StripeService] Delete Payment Method failed:', error);
            throw error;
        }
    }

    async getSubscriptions(customerId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            const subscriptions = await this.stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
            });
            return subscriptions.data;
        } catch (error: any) {
            console.error('[StripeService] Get Subscriptions failed:', error);
            throw error;
        }
    }

    async getCustomer(customerId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            return await this.stripe.customers.retrieve(customerId);
        } catch (error: any) {
            console.error('[StripeService] Get Customer failed:', error);
            throw error;
        }
    }

    async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
        await this.ensureInitialized();
        if (!this.stripe) throw new Error('Stripe not initialized');
        try {
            await this.stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });
            return { success: true };
        } catch (error: any) {
            console.error('[StripeService] Set Default Payment Method failed:', error);
            throw error;
        }
    }
}

export const stripeService = new StripeService();
