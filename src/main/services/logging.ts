import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
    LoggerProvider,
    SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { app } from 'electron';

let loggerProvider: LoggerProvider | null = null;

export function initOTLPLogging() {
    const POSTHOG_KEY = process.env.VITE_POSTHOG_API_KEY;
    const POSTHOG_HOST = process.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

    if (!POSTHOG_KEY) {
        console.warn('[Logging] PostHog API key missing, OTLP logging disabled');
        return;
    }

    const exporter = new OTLPLogExporter({
        url: `${POSTHOG_HOST}/v1/logs`,
        headers: {
            'x-posthog-token': POSTHOG_KEY,
        },
    });

    const resource = resourceFromAttributes({
        'service.name': 'reavion-desktop',
        'service.version': app.getVersion(),
        'platform': 'desktop',
        'env': process.env.NODE_ENV || 'development',
    });

    loggerProvider = new LoggerProvider({
        resource,
        processors: [new SimpleLogRecordProcessor(exporter)],
    });

    logs.setGlobalLoggerProvider(loggerProvider);

    console.log('[Logging] PostHog OTLP logging initialized');

    // Hook into console to capture logs
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const logger = logs.getLogger('default');

    console.log = (...args: any[]) => {
        originalLog.apply(console, args);
        emitLog(SeverityNumber.INFO, args);
    };

    console.warn = (...args: any[]) => {
        originalWarn.apply(console, args);
        emitLog(SeverityNumber.WARN, args);
    };

    console.error = (...args: any[]) => {
        originalError.apply(console, args);
        emitLog(SeverityNumber.ERROR, args);
    };

    function emitLog(severityNumber: SeverityNumber, args: any[]) {
        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        logger.emit({
            severityNumber,
            severityText: getSeverityText(severityNumber),
            body: message,
            attributes: {
                'app.process': 'main',
                'platform': 'desktop',
            },
        });
    }
}

function getSeverityText(severity: SeverityNumber): string {
    switch (severity) {
        case SeverityNumber.INFO: return 'INFO';
        case SeverityNumber.WARN: return 'WARN';
        case SeverityNumber.ERROR: return 'ERROR';
        default: return 'DEBUG';
    }
}

export async function shutdownLogging() {
    if (loggerProvider) {
        await loggerProvider.shutdown();
    }
}
