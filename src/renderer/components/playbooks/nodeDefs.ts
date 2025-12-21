
import {
    Play, Square, HelpCircle, Repeat, Clock,
    List, Sparkles, Filter,
    Globe, Search, MessageCircle, FileText,
    Cpu, Webhook, MousePointer,
    CheckCircle, PauseCircle,
    Heart, Reply, Send, UserPlus, MessagesSquare, MoveDown, Wand2
} from 'lucide-react';
import { PlaybookNodeType } from '@/types/playbook';

export const NODE_CATEGORIES = {
    CONTROL: 'Control',
    TARGET: 'Target source',
    ACTION: 'Action',
    BROWSER: 'Browser',
    X: 'X (Twitter)',
    CAPABILITY: 'Capability',
    HITL: 'Human in the Loop'
};

export interface NodeTypeDefinition {
    type: PlaybookNodeType;
    label: string;
    category: string;
    icon: any;
    description: string;
    color: string;
    inputs: number; // 0, 1, or more (simplified validity check)
    outputs: number;
}

export const NODE_DEFINITIONS: Record<PlaybookNodeType, NodeTypeDefinition> = {
    start: {
        type: 'start',
        label: 'Start',
        category: NODE_CATEGORIES.CONTROL,
        icon: Play,
        description: 'Entry point of the playbook',
        color: 'bg-primary/10 text-primary',
        inputs: 0,
        outputs: 1
    },
    end: {
        type: 'end',
        label: 'End',
        category: NODE_CATEGORIES.CONTROL,
        icon: Square,
        description: 'Successful completion',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 0
    },
    condition: {
        type: 'condition',
        label: 'Condition',
        category: NODE_CATEGORIES.CONTROL,
        icon: HelpCircle,
        description: 'Branch based on logic',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 2 // True/False handles handled in component
    },
    loop: {
        type: 'loop',
        label: 'Loop',
        category: NODE_CATEGORIES.CONTROL,
        icon: Repeat,
        description: 'Iterate over items',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 2
    },
    wait: {
        type: 'wait',
        label: 'Wait',
        category: NODE_CATEGORIES.CONTROL,
        icon: Clock,
        description: 'Delay execution',
        color: 'bg-primary/10 text-primary',
        inputs: 1,
        outputs: 1
    },
    use_target_list: {
        type: 'use_target_list',
        label: 'Use List',
        category: NODE_CATEGORIES.TARGET,
        icon: List,
        description: 'Load targets from database',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    generate_targets: {
        type: 'generate_targets',
        label: 'Generate',
        category: NODE_CATEGORIES.TARGET,
        icon: Sparkles,
        description: 'AI generated targets',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    filter_targets: {
        type: 'filter_targets',
        label: 'Filter',
        category: NODE_CATEGORIES.TARGET,
        icon: Filter,
        description: 'Refine target list',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    navigate: {
        type: 'navigate',
        label: 'Navigate',
        category: NODE_CATEGORIES.BROWSER,
        icon: Globe,
        description: 'Go to URL',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    analyze: {
        type: 'analyze',
        label: 'Analyze',
        category: NODE_CATEGORIES.BROWSER,
        icon: Search,
        description: 'Analyze page content',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    scroll: {
        type: 'scroll',
        label: 'Scroll',
        category: NODE_CATEGORIES.BROWSER,
        icon: MoveDown,
        description: 'Scroll the page',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    engage: {
        type: 'engage',
        label: 'Engage',
        category: NODE_CATEGORIES.BROWSER,
        icon: MessageCircle,
        description: 'Interact/Comment/DM',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    extract: {
        type: 'extract',
        label: 'Extract',
        category: NODE_CATEGORIES.BROWSER,
        icon: FileText,
        description: 'Scrape data',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    x_search: {
        type: 'x_search',
        label: 'X Search',
        category: NODE_CATEGORIES.X,
        icon: Search,
        description: 'Search for posts on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_advanced_search: {
        type: 'x_advanced_search',
        label: 'X Adv Search',
        category: NODE_CATEGORIES.X,
        icon: Search,
        description: 'Advanced X.com Search',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_like: {
        type: 'x_like',
        label: 'X Like',
        category: NODE_CATEGORIES.X,
        icon: Heart,
        description: 'Like a post on X',
        color: 'bg-[#F91880]/10 text-[#F91880]',
        inputs: 1,
        outputs: 1
    },
    x_reply: {
        type: 'x_reply',
        label: 'X Reply',
        category: NODE_CATEGORIES.X,
        icon: Reply,
        description: 'Reply to a post on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_post: {
        type: 'x_post',
        label: 'X Post',
        category: NODE_CATEGORIES.X,
        icon: Send,
        description: 'Create a new post on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_follow: {
        type: 'x_follow',
        label: 'X Follow',
        category: NODE_CATEGORIES.X,
        icon: UserPlus,
        description: 'Follow/Unfollow user on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_engage: {
        type: 'x_engage',
        label: 'X Engage',
        category: NODE_CATEGORIES.X,
        icon: MessagesSquare,
        description: 'Multi-action engagement on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    mcp_call: {
        type: 'mcp_call',
        label: 'MCP Call',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: Cpu,
        description: 'Call external tool',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    api_call: {
        type: 'api_call',
        label: 'API Call',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: Webhook,
        description: 'HTTP Request',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    browser_action: {
        type: 'browser_action',
        label: 'Browser Act',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: MousePointer,
        description: 'Low-level action',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    humanize: {
        type: 'humanize',
        label: 'Humanize',
        category: NODE_CATEGORIES.CAPABILITY,
        icon: Wand2,
        description: 'Make text undetectable by AI detectors',
        color: 'bg-purple-500/10 text-purple-500',
        inputs: 1,
        outputs: 1
    },
    approval: {
        type: 'approval',
        label: 'Approval',
        category: NODE_CATEGORIES.HITL,
        icon: CheckCircle,
        description: 'Wait for human',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    },
    pause: {
        type: 'pause',
        label: 'Pause',
        category: NODE_CATEGORIES.HITL,
        icon: PauseCircle,
        description: 'Pause execution',
        color: 'bg-secondary text-secondary-foreground',
        inputs: 1,
        outputs: 1
    }
};
