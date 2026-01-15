import { Check, CreditCard, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

interface PricingTableProps {
    onSubscribe: (priceId: string) => void;
    onManageSubscription: () => void;
    isLoading?: boolean;
    subscription?: any;
    config?: any;
}

export function PricingTable({ onSubscribe, onManageSubscription, isLoading, subscription, config }: PricingTableProps) {
    const proPriceId = config?.proPriceId || import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
    const isPro = subscription && (subscription.status === 'active' || subscription.status === 'trialing');

    const getRenewalDate = () => {
        if (!subscription?.current_period_end) return null;
        const timestamp = typeof subscription.current_period_end === 'number'
            ? subscription.current_period_end * 1000
            : new Date(subscription.current_period_end).getTime();
        return format(new Date(timestamp), "MMM d, yyyy");
    };

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Current Plan Card */}
            <Card className="flex flex-col">
                <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base font-medium">Current Plan</CardTitle>
                    </div>
                    <CardDescription className="text-lg font-semibold text-foreground">
                        {isPro ? "You're on the Pro plan" : "You're on the Free plan"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                    <p className="text-muted-foreground text-sm">
                        {isPro
                            ? 'Manage your subscription methods and billing details.'
                            : 'Upgrade to Pro for full access to all features and priority support.'
                        }
                    </p>

                    {isPro && (
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                    {subscription.cancel_at_period_end ? 'Access until:' : 'Next billing date:'}
                                </span>
                                <span className={`font-medium ${subscription.cancel_at_period_end ? 'text-amber-500' : ''}`}>
                                    {getRenewalDate()}
                                </span>
                            </div>
                            {subscription.cancel_at_period_end && (
                                <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                    Your plan will revert to Free on this date.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    {!isPro && (
                        <Button
                            className="w-full"
                            variant="secondary"
                            onClick={() => onSubscribe(proPriceId)}
                            disabled={isLoading || !proPriceId}
                        >
                            Upgrade to Pro
                        </Button>
                    )}
                    {isPro && (
                        <Button
                            className="w-full border-destructive/20 text-destructive hover:bg-destructive/10"
                            variant="outline"
                            onClick={onManageSubscription}
                            disabled={isLoading}
                        >
                            {subscription.cancel_at_period_end ? 'Keep Subscription' : 'Cancel Subscription'}
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {/* Pro Plan Card */}
            <Card className={`flex flex-col border-primary/20 ${isPro ? 'opacity-80' : ''}`}>
                <CardHeader>
                    <CardTitle>Pro Plan</CardTitle>
                    <CardDescription className="text-primary font-medium">$49.99/month</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                    <ul className="space-y-3 text-sm">
                        {['Unlimited Projects', 'Advanced Analytics', 'Priority Support', 'Access to AI Agents'].map((feature, i) => (
                            <li key={i} className="flex items-center">
                                <Check className="mr-2 h-4 w-4 text-primary" />
                                {feature}
                            </li>
                        ))}
                    </ul>
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full"
                        onClick={() => onSubscribe(proPriceId)}
                        disabled={isLoading || isPro}
                    >
                        {isPro ? 'Current Plan' : 'Get Started'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
