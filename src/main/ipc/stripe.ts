import { IpcMain } from 'electron';
import { stripeService } from '../services/stripe.service';
import { systemSettingsService } from '../services/settings.service';

export function setupStripeHandlers(ipcMain: IpcMain) {
    ipcMain.handle('stripe:get-config', async () => {
        try {
            const config = await systemSettingsService.getStripeConfig();
            return {
                publishableKey: config.publishableKey,
                proPriceId: config.proPriceId,
                credits100PriceId: config.credits100PriceId,
                credits500PriceId: config.credits500PriceId,
                credits1000PriceId: config.credits1000PriceId,
            };
        } catch (error: any) {
            console.error('[IPC] stripe:get-config error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:create-payment-intent', async (_, { amount, currency, metadata, customerId }) => {
        try {
            return await stripeService.createPaymentIntent(amount, currency, metadata, customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:create-payment-intent error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:fulfill-payment-intent', async (_, paymentIntentId: string) => {
        try {
            return await stripeService.fulfillPaymentIntent(paymentIntentId);
        } catch (error: any) {
            console.error('[IPC] stripe:fulfill-payment-intent error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:create-subscription', async (_, { customerId, priceId, promoCode }) => {
        try {
            return await stripeService.createSubscription(customerId, priceId, promoCode);
        } catch (error: any) {
            console.error('[IPC] stripe:create-subscription error:', error);
            // Return simpler message for better UI toasts
            throw error;
        }
    });

    ipcMain.handle('stripe:create-customer', async (_, { email, name }) => {
        try {
            return await stripeService.createCustomer(email, name);
        } catch (error: any) {
            console.error('[IPC] stripe:create-customer error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:create-portal-session', async (_, { customerId, returnUrl }) => {
        try {
            return await stripeService.createPortalSession(customerId, returnUrl);
        } catch (error: any) {
            console.error('[IPC] stripe:create-portal-session error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:get-invoices', async (_, customerId: string) => {
        try {
            return await stripeService.getInvoices(customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:get-invoices error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:get-payment-methods', async (_, customerId: string) => {
        try {
            return await stripeService.getPaymentMethods(customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:get-payment-methods error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:cancel-subscription', async (_, subscriptionId: string) => {
        try {
            return await stripeService.cancelSubscription(subscriptionId);
        } catch (error: any) {
            console.error('[IPC] stripe:cancel-subscription error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:update-subscription', async (_, { subscriptionId, params }) => {
        try {
            return await stripeService.updateSubscription(subscriptionId, params);
        } catch (error: any) {
            console.error('[IPC] stripe:update-subscription error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:create-setup-intent', async (_, customerId: string) => {
        try {
            return await stripeService.createSetupIntent(customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:create-setup-intent error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:delete-payment-method', async (_, paymentMethodId: string) => {
        try {
            return await stripeService.deletePaymentMethod(paymentMethodId);
        } catch (error: any) {
            console.error('[IPC] stripe:delete-payment-method error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:get-subscriptions', async (_, customerId: string) => {
        try {
            return await stripeService.getSubscriptions(customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:get-subscriptions error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:get-customer', async (_, customerId: string) => {
        try {
            return await stripeService.getCustomer(customerId);
        } catch (error: any) {
            console.error('[IPC] stripe:get-customer error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:set-default-payment-method', async (_, { customerId, paymentMethodId }) => {
        try {
            return await stripeService.setDefaultPaymentMethod(customerId, paymentMethodId);
        } catch (error: any) {
            console.error('[IPC] stripe:set-default-payment-method error:', error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('stripe:get-tier-limits', async (_, accessToken?: string) => {
        try {
            return await systemSettingsService.getTierLimits(accessToken);
        } catch (error: any) {
            console.error('[IPC] stripe:get-tier-limits error:', error);
            throw new Error(error.message);
        }
    });
}
