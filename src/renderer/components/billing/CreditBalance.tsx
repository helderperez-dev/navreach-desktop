import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CreditPackage {
    id: string;
    amount: number;
    price: number;
    label: string;
    priceId: string;
}

const creditPackages: CreditPackage[] = [
    { id: '100', amount: 100, price: 10, label: '100 Credits', priceId: import.meta.env.VITE_STRIPE_CREDITS_100_PRICE_ID },
    { id: '500', amount: 500, price: 45, label: '500 Credits', priceId: import.meta.env.VITE_STRIPE_CREDITS_500_PRICE_ID },
    { id: '1000', amount: 1000, price: 80, label: '1000 Credits', priceId: import.meta.env.VITE_STRIPE_CREDITS_1000_PRICE_ID },
];

interface CreditBalanceProps {
    balance: number;
    onBuyCredits: (amount: number, priceId: string) => void;
    isLoading?: boolean;
}

export function CreditBalance({ balance, onBuyCredits, isLoading }: CreditBalanceProps) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Credit Balance</CardTitle>
                    <CardDescription>Use credits for AI actions and premium tasks.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-4xl font-bold text-primary">{balance}</div>
                    <div className="text-sm text-muted-foreground mt-1">Available Credits</div>
                </CardContent>
            </Card>

            <h3 className="text-lg font-semibold mt-8 mb-4">Top Up Credits</h3>
            <div className="grid gap-4 md:grid-cols-3">
                {creditPackages.map((pkg) => (
                    <Card key={pkg.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => onBuyCredits(pkg.amount, pkg.priceId)}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{pkg.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${pkg.price}</div>
                            <Button
                                variant="outline"
                                className="w-full mt-4"
                                onClick={(e) => { e.stopPropagation(); onBuyCredits(pkg.amount, pkg.priceId); }}
                                disabled={isLoading}
                            >
                                Buy Now
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
