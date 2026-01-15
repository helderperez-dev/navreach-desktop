import { useEffect, useState } from 'react';
import { useBillingStore } from '@/stores/billing.store';
import { PricingTable } from './PricingTable';
import { CreditBalance } from './CreditBalance';
import { PaymentModal } from './PaymentModal';
import { InvoicesList } from './InvoicesList';
import { PaymentMethodsList } from './PaymentMethodsList';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CircularLoader } from '@/components/ui/CircularLoader';

export function BillingView() {
    const { credits, subscription, fetchCredits, fetchSubscription } = useBillingStore();
    const [modalOpen, setModalOpen] = useState(false);
    const [clientSecret, setClientSecret] = useState('');
    const [paymentContext, setPaymentContext] = useState<{ amount?: string; description?: string }>({});
    const [loading, setLoading] = useState(false);
    const [stripeSubscription, setStripeSubscription] = useState<any>(null);
    const [customerId, setCustomerId] = useState<string | undefined>();
    const [refreshKey, setRefreshKey] = useState(0);
    const [stripeConfig, setStripeConfig] = useState<any>(null);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                const [_, __, cid] = await Promise.all([
                    fetchCredits(),
                    fetchSubscription(),
                    loadCustomerId()
                ]);

                // Also load stripe subscription if we have a customer
                if (cid) {
                    await loadStripeSubscription(cid);
                }

                const config = await window.api.stripe.getConfig();
                setStripeConfig(config);
            } catch (err) {
                console.error('Failed to load Stripe config:', err);
            } finally {
                setInitialLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (customerId) {
            loadStripeSubscription();
        }
    }, [customerId, refreshKey]);

    const loadCustomerId = async (): Promise<string | undefined> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
            const cid = profile?.stripe_customer_id;
            setCustomerId(cid);
            return cid;
        }
        return undefined;
    };

    const loadStripeSubscription = async (cid?: string) => {
        const id = cid || customerId;
        if (!id) return;
        try {
            const subs = await window.api.stripe.getSubscriptions(id);
            const active = subs.find((s: any) => s.status === 'active' || s.status === 'trialing');
            setStripeSubscription(active || null);
        } catch (error) {
            console.error('Failed to load Stripe subscription:', error);
        }
    };

    const ensureCustomer = async (): Promise<string> => {
        if (customerId) return customerId;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const customer = await window.api.stripe.createCustomer(user.email!, user.user_metadata?.full_name);
        const cid = customer.id;
        await supabase.from('profiles').update({ stripe_customer_id: cid }).eq('id', user.id);
        setCustomerId(cid);
        return cid;
    };

    const handleSubscribe = async (priceId: string) => {
        setLoading(true);
        try {
            const cid = await ensureCustomer();
            const { clientSecret } = await window.api.stripe.createSubscription(cid, priceId);
            setPaymentContext({ amount: '$49.99', description: 'Pro Subscription' });
            setClientSecret(clientSecret);
            setModalOpen(true);
        } catch (error: any) {
            console.error('Subscription error:', error);
            toast.error('Failed to start subscription: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelSubscription = async () => {
        const sub = stripeSubscription || subscription;
        if (!sub?.id) return;

        const isEnding = sub.cancel_at_period_end;

        if (isEnding) {
            // Reactivate
            setLoading(true);
            try {
                await window.api.stripe.updateSubscription(sub.id, { cancel_at_period_end: false });
                toast.success('Subscription reactivated.');
                setRefreshKey(prev => prev + 1);
                fetchSubscription();
            } catch (error: any) {
                toast.error('Failed to reactivate: ' + error.message);
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!confirm('Are you sure you want to cancel your subscription? You will keep access to Pro features until the end of your current billing period.')) {
            return;
        }

        setLoading(true);
        try {
            await window.api.stripe.updateSubscription(sub.id, { cancel_at_period_end: true });
            toast.success('Subscription set to cancel at the end of billing period.');
            setRefreshKey(prev => prev + 1);
            fetchSubscription();
        } catch (error: any) {
            console.error('Cancellation error:', error);
            toast.error('Failed to update subscription: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBuyCredits = async (amount: number, _priceId: string) => {
        const priceMap: Record<number, number> = {
            100: 1000, // $10.00
            500: 4500, // $45.00
            1000: 8000 // $80.00
        };

        const priceInCents = priceMap[amount];
        if (!priceInCents) return;

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const cid = await ensureCustomer();

            const { clientSecret } = await window.api.stripe.createPaymentIntent(priceInCents, 'usd', {
                userId: String(user.id),
                credits: String(amount),
                type: 'credit_purchase'
            }, cid);

            setPaymentContext({
                amount: `$${(priceInCents / 100).toFixed(2)}`,
                description: `${amount} Credits`
            });
            setClientSecret(clientSecret);
            setModalOpen(true);
        } catch (error: any) {
            console.error('Credit purchase error:', error);
            toast.error('Failed to initiate purchase: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPaymentMethod = async () => {
        setLoading(true);
        try {
            const cid = await ensureCustomer();
            const { clientSecret } = await window.api.stripe.createSetupIntent(cid);
            setPaymentContext({ description: 'Securely save a card for future use' });
            setClientSecret(clientSecret);
            setModalOpen(true);
        } catch (error: any) {
            console.error('Setup error:', error);
            toast.error('Failed to prepare card setup: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePaymentSuccess = () => {
        setModalOpen(false);
        toast.success('Operation successful!');
        setRefreshKey(prev => prev + 1);

        setTimeout(() => {
            fetchCredits();
            fetchSubscription();
            loadStripeSubscription();
        }, 2000);
    };

    if (initialLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] h-[60vh] w-full">
                <CircularLoader className="h-6 w-6" />
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-12">
            <div>
                <h1 className="text-3xl font-bold mb-2">Billing</h1>
                <p className="text-muted-foreground">Manage your subscription and credits.</p>
            </div>

            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Subscription</h2>
                <PricingTable
                    onSubscribe={handleSubscribe}
                    onManageSubscription={handleCancelSubscription}
                    isLoading={loading || initialLoading}
                    subscription={stripeSubscription || subscription}
                    config={stripeConfig}
                />
            </section>

            {/* Native Management Sections */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Payment Methods</h2>
                    <Button variant="outline" size="sm" onClick={handleAddPaymentMethod} disabled={loading}>
                        Add Card
                    </Button>
                </div>
                <PaymentMethodsList customerId={customerId} refreshKey={refreshKey} />
            </section>

            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Invoices</h2>
                <InvoicesList customerId={customerId} />
            </section>

            {/* 
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Credits</h2>
                <CreditBalance
                    balance={credits}
                    onBuyCredits={handleBuyCredits}
                    isLoading={loading}
                />
            </section>
*/}

            <PaymentModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                clientSecret={clientSecret}
                onSuccess={handlePaymentSuccess}
                amount={paymentContext.amount}
                description={paymentContext.description}
                customerId={customerId}
            />
        </div>
    );
}
