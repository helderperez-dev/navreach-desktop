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
    const {
        credits,
        subscription,
        fetchCredits,
        fetchSubscription,
        customerId,
        loadCustomerId,
        stripeConfig,
        loadStripeConfig,
        initiateSubscription,
        isLoading: globalLoading,
        handlePaymentSuccess: globalPaymentSuccess
    } = useBillingStore();

    const [loading, setLoading] = useState(false);
    const [stripeSubscription, setStripeSubscription] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                const [_, __, cid] = await Promise.all([
                    fetchCredits(),
                    fetchSubscription(),
                    loadCustomerId()
                ]);

                if (cid) {
                    await loadStripeSubscription(cid);
                }

                await loadStripeConfig();
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

    const handleSubscribe = async (priceId: string) => {
        try {
            await initiateSubscription(priceId);
        } catch (error: any) {
            toast.error('Failed to start subscription: ' + error.message);
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

    const handleAddPaymentMethod = async () => {
        setLoading(true);
        try {
            // This could also be moved to store if needed
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Re-using the store's customer logic if needed, but for simplicity:
            const cid = customerId || await useBillingStore.getState().ensureCustomer();
            const { clientSecret } = await window.api.stripe.createSetupIntent(cid);

            // Open global modal with custom context
            useBillingStore.setState({
                clientSecret,
                paymentContext: { description: 'Securely save a card for future use' },
                isPaymentModalOpen: true
            });
        } catch (error: any) {
            console.error('Setup error:', error);
            toast.error('Failed to prepare card setup: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] h-[60vh] w-full">
                <CircularLoader className="h-6 w-6" />
            </div>
        );
    }

    const currentLoading = loading || globalLoading;

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
                    isLoading={currentLoading || initialLoading}
                    subscription={stripeSubscription || subscription}
                    config={stripeConfig}
                />
            </section>

            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Payment Methods</h2>
                    <Button variant="outline" size="sm" onClick={handleAddPaymentMethod} disabled={currentLoading}>
                        Add Card
                    </Button>
                </div>
                <PaymentMethodsList customerId={customerId || undefined} refreshKey={refreshKey} />
            </section>

            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Invoices</h2>
                <InvoicesList customerId={customerId || undefined} />
            </section>
        </div>
    );
}
