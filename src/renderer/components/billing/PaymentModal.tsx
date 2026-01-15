import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
    Elements,
    useStripe,
    useElements,
    CardNumberElement,
    CardExpiryElement,
    CardCvcElement
} from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCard, Plus, Check, Lock, Tag } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { Separator } from '@/components/ui/separator';

// Initialized dynamically and cached
let stripePromiseCached: any = null;
const getStripePromise = () => {
    if (!stripePromiseCached) {
        stripePromiseCached = window.api.stripe.getConfig().then((config: any) => {
            return loadStripe(config.publishableKey || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
        });
    }
    return stripePromiseCached;
};

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientSecret: string;
    onSuccess: () => void;
    amount?: string;
    description?: string;
    customerId?: string;
    promoCode?: string;
    formattedSubtotal?: string;
    formattedDiscount?: string;
}

const ELEMENT_OPTIONS = {
    style: {
        base: {
            fontSize: '14px',
            color: '#ffffff',
            '::placeholder': {
                color: '#aab7c4',
            },
        },
        invalid: {
            color: '#ef4444',
        },
    },
};

function PaymentForm({
    onSuccess,
    clientSecret,
    amount,
    description,
    customerId
}: {
    onSuccess: () => void;
    clientSecret: string;
    amount?: string;
    description?: string;
    customerId?: string;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [existingMethods, setExistingMethods] = useState<any[]>([]);
    const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
    const [showNewCard, setShowNewCard] = useState(false);
    const [loadingMethods, setLoadingMethods] = useState(false);

    const isSetupIntent = clientSecret.startsWith('seti_');

    useEffect(() => {
        if (customerId) {
            loadMethods();
        }
    }, [customerId]);

    const loadMethods = async () => {
        setLoadingMethods(true);
        try {
            const data = await window.api.stripe.getPaymentMethods(customerId!);
            setExistingMethods(data);
            if (data.length > 0) {
                // Pre-select default or first one
                const customer = await window.api.stripe.getCustomer(customerId!);
                const defaultId = customer.invoice_settings?.default_payment_method;
                setSelectedMethodId(defaultId || data[0].id);
            } else {
                setShowNewCard(true);
            }
        } catch (err) {
            console.error('Failed to load methods:', err);
        } finally {
            setLoadingMethods(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || (!elements && !selectedMethodId)) return;

        setLoading(true);
        setError(null);

        let result;

        const commonParams = selectedMethodId
            ? { payment_method: selectedMethodId }
            : { payment_method: { card: elements!.getElement(CardNumberElement)! } };

        try {
            if (isSetupIntent) {
                result = await stripe.confirmCardSetup(clientSecret, commonParams);
            } else {
                result = await stripe.confirmCardPayment(clientSecret, commonParams);
            }

            if (result.error) {
                setError(result.error.message || 'An error occurred');
                setLoading(false);
            } else {
                // If it's a payment, try to fulfill it immediately
                if (!isSetupIntent) {
                    try {
                        const piId = clientSecret.split('_secret')[0];
                        await window.api.stripe.fulfillPaymentIntent(piId);
                    } catch (fulfillErr) {
                        console.error('Fulfillment error:', fulfillErr);
                        // We still consider it a success if payment went through, 
                        // background sync should pick it up eventually if this fails.
                    }
                }
                onSuccess();
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred');
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col pt-2">
            <div className="flex-1 space-y-6">
                {/* Existing Methods */}
                {!isSetupIntent && existingMethods.length > 0 && (
                    <div className="space-y-3">
                        <Label>Use Saved Card</Label>
                        <div className="space-y-2">
                            {existingMethods.map((method) => (
                                <button
                                    key={method.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedMethodId(method.id);
                                        setShowNewCard(false);
                                    }}
                                    className={`w-full flex items-center justify-between p-3 border rounded-lg transition-all ${selectedMethodId === method.id && !showNewCard
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                        : 'hover:border-primary/50'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 text-left">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium capitalize">{method.card.brand} •••• {method.card.last4}</p>
                                            <p className="text-xs text-muted-foreground">Expires {method.card.exp_month}/{method.card.exp_year}</p>
                                        </div>
                                    </div>
                                    {selectedMethodId === method.id && !showNewCard && (
                                        <Check className="h-4 w-4 text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setShowNewCard(true);
                                setSelectedMethodId(null);
                            }}
                            className={`w-full flex items-center gap-2 p-3 border border-dashed rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-all ${showNewCard ? 'border-primary bg-primary/5 ring-1 ring-primary text-foreground' : ''
                                }`}
                        >
                            <Plus className="h-4 w-4" />
                            Use a different card
                        </button>
                    </div>
                )}

                {(showNewCard || isSetupIntent || existingMethods.length === 0) && (
                    <div className="space-y-4">
                        {existingMethods.length > 0 && <Separator className="mb-4" />}
                        <div className="space-y-2">
                            <Label htmlFor="card-number">Card Number</Label>
                            <div className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 items-center gap-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                <CardNumberElement
                                    id="card-number"
                                    options={ELEMENT_OPTIONS}
                                    className="w-full"
                                    onReady={(element) => element.focus()}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="card-expiry">Expiration</Label>
                                <div className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                                    <CardExpiryElement id="card-expiry" options={ELEMENT_OPTIONS} className="w-full" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="card-cvc">CVC</Label>
                                <div className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 items-center gap-2">
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                    <CardCvcElement id="card-cvc" options={ELEMENT_OPTIONS} className="w-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 space-y-4">
                {error && <div className="text-destructive text-sm font-medium animate-in fade-in slide-in-from-top-1">{error}</div>}

                <Button
                    type="submit"
                    disabled={!stripe || loading}
                    className="w-full py-6 text-base font-semibold transition-all active:scale-[0.98]"
                >
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <CircularLoader className="h-4 w-4" />
                            Processing...
                        </div>
                    ) : (
                        isSetupIntent ? 'Save' : 'Pay'
                    )}
                </Button>
            </div>
        </form>
    );
}

export function PaymentModal({ isOpen, onClose, clientSecret, onSuccess, amount, description, customerId, promoCode, formattedSubtotal, formattedDiscount }: PaymentModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="sm:max-w-[750px] p-0 overflow-hidden border-border/50 bg-background"
            >
                <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
                    {/* Left Panel: Summary */}
                    <div className="w-full md:w-[300px] bg-muted/30 p-8 border-r border-border/50 flex flex-col justify-between">
                        <div className="space-y-6">
                            {isSetupIntent(clientSecret) ? (
                                <>
                                    <div>
                                        <h2 className="text-xl font-semibold mb-1">Add Payment Method</h2>
                                        <p className="text-sm text-muted-foreground">Save card details for future use.</p>
                                    </div>
                                    <div className="space-y-4 pt-4">
                                        <div className="p-4 rounded-xl bg-background border border-border/50 space-y-3 shadow-sm">
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Account Benefits</p>
                                                <ul className="text-sm space-y-2 pt-2 font-medium">
                                                    <li className="flex items-start gap-2">
                                                        <span className="text-muted-foreground mt-0.5">•</span>
                                                        <span>Instant checkouts for credits</span>
                                                    </li>
                                                    <li className="flex items-start gap-2">
                                                        <span className="text-muted-foreground mt-0.5">•</span>
                                                        <span>Automatic subscription renewals</span>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <h2 className="text-xl font-semibold mb-1">Order Details</h2>
                                        <p className="text-sm text-muted-foreground">Review your selection before payment.</p>
                                    </div>

                                    <div className="space-y-4 pt-4">
                                        <div className="p-4 rounded-xl bg-background border border-border/50 space-y-3 shadow-sm">
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Selected Plan</p>
                                                <p className="text-base font-semibold">{description || "Subscription Upgrade"}</p>
                                            </div>

                                            {promoCode && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 py-1 px-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                                        <Tag className="h-3 w-3 text-blue-500" />
                                                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                                                            Code applied: {promoCode}
                                                        </span>
                                                    </div>

                                                    {formattedSubtotal && formattedDiscount && (
                                                        <div className="space-y-1.5 px-1">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-muted-foreground">Original Price</span>
                                                                <span className="line-through text-muted-foreground/60">
                                                                    {formattedSubtotal}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-xs font-medium text-emerald-500">
                                                                <span>Discount</span>
                                                                <span>
                                                                    -{formattedDiscount}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <Separator className="bg-border/50" />
                                            <div className="flex justify-between items-end">
                                                <p className="text-sm text-muted-foreground">Total to pay:</p>
                                                <p className="text-2xl font-bold text-foreground">{amount || "$0.00"}</p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="space-y-2 px-1">
                                <p className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Check className="h-3 w-3 text-muted-foreground/60" />
                                    Secure encrypted payment
                                </p>
                                {!isSetupIntent(clientSecret) && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                                        <Check className="h-3 w-3 text-muted-foreground/60" />
                                        Instant activation
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="hidden md:block pt-8">
                            <div className="flex items-center gap-2 text-muted-foreground/50">
                                <CreditCard className="h-4 w-4" />
                                <span className="text-[10px] font-medium uppercase tracking-tighter">Powered by Stripe</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Payment Selection */}
                    <div className="flex-1 p-8 flex flex-col overflow-y-auto">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl">Payment Method</DialogTitle>
                            <DialogDescription>
                                {isSetupIntent(clientSecret)
                                    ? 'Add a card to your account.'
                                    : 'Confirm your payment details below.'
                                }
                            </DialogDescription>
                        </DialogHeader>

                        {clientSecret && (
                            <Elements stripe={getStripePromise()} options={{
                                clientSecret,
                                appearance: {
                                    theme: 'night',
                                    variables: {
                                        colorPrimary: '#e2e8f0', // Neutral Slate
                                        colorBackground: 'transparent',
                                    }
                                }
                            }}>
                                <PaymentForm
                                    onSuccess={onSuccess}
                                    clientSecret={clientSecret}
                                    amount={amount}
                                    description={description}
                                    customerId={customerId}
                                />
                            </Elements>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function isSetupIntent(secret: string) {
    return secret?.startsWith('seti_');
}
