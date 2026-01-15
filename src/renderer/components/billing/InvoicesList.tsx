import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircularLoader } from "@/components/ui/CircularLoader";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface InvoicesListProps {
    customerId?: string;
}

export function InvoicesList({ customerId }: InvoicesListProps) {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (customerId) {
            loadInvoices();
        }
    }, [customerId]);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const data = await window.api.stripe.getInvoices(customerId!);
            setInvoices(data);
        } catch (error) {
            console.error("Failed to load invoices", error);
        } finally {
            setLoading(false);
        }
    };

    const downloadInvoice = (url: string) => {
        window.api.browser.download(url);
    };

    const isLoadingData = loading || !customerId;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>View and download your past invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingData ? (
                    <div className="flex justify-center p-4">
                        <CircularLoader className="h-6 w-6" />
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                        No invoices found.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.map((invoice) => (
                                <TableRow key={invoice.id}>
                                    <TableCell>
                                        {format(new Date(invoice.created * 1000), "MMM d, yyyy")}
                                    </TableCell>
                                    <TableCell>
                                        ${(invoice.amount_paid / 100).toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                                            {invoice.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {invoice.invoice_pdf && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => downloadInvoice(invoice.invoice_pdf)}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                PDF
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
