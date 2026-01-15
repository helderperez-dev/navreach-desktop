import { useEffect, useState } from "react";
import { CreditCard, Trash2, CheckCircle2 } from "lucide-react";
import { CircularLoader } from "@/components/ui/CircularLoader";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PaymentMethodsListProps {
    customerId?: string;
    refreshKey?: number;
}

export function PaymentMethodsList({ customerId, refreshKey }: PaymentMethodsListProps) {
    const [methods, setMethods] = useState<any[]>([]);
    const [defaultMethodId, setDefaultMethodId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (customerId) {
            loadMethods();
        }
    }, [customerId, refreshKey]);

    const loadMethods = async () => {
        setLoading(true);
        try {
            const [methodsData, customerData] = await Promise.all([
                window.api.stripe.getPaymentMethods(customerId!),
                window.api.stripe.getCustomer(customerId!)
            ]);

            setMethods(methodsData);
            setDefaultMethodId(customerData.invoice_settings?.default_payment_method);
        } catch (error) {
            console.error("Failed to load payment methods", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSetDefault = async (methodId: string) => {
        setActionLoading(methodId);
        try {
            await window.api.stripe.setDefaultPaymentMethod(customerId!, methodId);
            setDefaultMethodId(methodId);
            toast.success("Default payment method updated.");
        } catch (error: any) {
            toast.error("Failed to set default: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (methodId: string) => {
        if (!confirm("Are you sure you want to remove this payment method?")) return;

        try {
            await window.api.stripe.deletePaymentMethod(methodId);
            toast.success("Payment method removed.");
            loadMethods();
        } catch (error: any) {
            toast.error("Failed to remove: " + error.message);
        }
    };

    const isLoadingData = loading || !customerId;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Manage your credit cards and payment details.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingData ? (
                    <div className="flex justify-center p-4">
                        <CircularLoader className="h-6 w-6" />
                    </div>
                ) : methods.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                        No payment methods saved.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {methods.map((method) => {
                            const isDefault = method.id === defaultMethodId;
                            return (
                                <div key={method.id} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center">
                                            <CreditCard className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium capitalize">{method.card.brand} •••• {method.card.last4}</p>
                                                {isDefault && (
                                                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors">
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">Expires {method.card.exp_month}/{method.card.exp_year}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isDefault && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleSetDefault(method.id)}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === method.id ? (
                                                    <CircularLoader className="h-3 w-3" />
                                                ) : (
                                                    "Set Default"
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(method.id)}
                                            disabled={!!actionLoading}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
