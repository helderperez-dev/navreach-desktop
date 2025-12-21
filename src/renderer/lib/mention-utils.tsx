import React from 'react';

/**
 * Helper to parse {{service.id}} tags into themed UI components
 */
export function ProcessedText({ text, variables }: { text: string; variables?: any[] }) {
    if (!text || typeof text !== 'string') return <>{text}</>;

    const regex = /({{([a-z]+)\.([a-zA-Z0-9-]+)}})/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const full = match[1];
        const service = match[2];
        const id = match[3];

        // Resolve label
        let label = id;

        // Find in variables if available
        if (variables) {
            const allVars = variables.flatMap(g => g.variables);
            const variable = allVars.find(v => v.value === full);
            if (variable) {
                label = variable.label;
            }
        }

        parts.push(
            <span
                key={match.index}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-[0.9em] align-baseline leading-none mx-0.5 select-none"
            >
                <span className="opacity-50 text-[9px] uppercase font-bold mr-1 pointer-events-none">{service}</span>
                <span className="pointer-events-none">{label}</span>
            </span>
        );

        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return <>{parts.length > 0 ? parts : text}</>;
}
