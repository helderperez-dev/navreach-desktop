
import {
    Play, Square, HelpCircle, Repeat, Clock,
    List, Sparkles, Filter,
    Globe, Search, MessageCircle, FileText,
    Cpu, Webhook, MousePointer,
    CheckCircle, PauseCircle,
    Heart, Reply, Send, UserPlus, MessagesSquare, MoveDown, Wand2, Users, User,
    Eye, Terminal, Layers, Download, Bell
} from 'lucide-react';
import { PlaybookNodeType } from '@/types/playbook';

export const NODE_CATEGORIES = {
    CONTROL: 'Control',
    TARGET: 'Target source',
    ACTION: 'Action',
    BROWSER: 'Browser',
    X: 'X (Twitter)'
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
    outputs_schema?: { label: string; value: string; example?: string }[];
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
        outputs: 2,
        outputs_schema: [
            { label: 'Current Item', value: 'item', example: '{ id: "123", content: "..." }' },
            { label: 'Current Index', value: 'index', example: '0' }
        ]
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
    capture_leads: {
        type: 'capture_leads',
        label: 'Capture Leads',
        category: NODE_CATEGORIES.TARGET,
        icon: Download,
        description: 'Save found leads to database',
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
        outputs: 1,
        outputs_schema: [
            { label: 'Analysis Result', value: 'analysis', example: 'This post is about...' },
            { label: 'Confidence', value: 'confidence', example: '0.95' }
        ]
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
    click: {
        type: 'click',
        label: 'Click',
        category: NODE_CATEGORIES.BROWSER,
        icon: MousePointer,
        description: 'Click an element',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    type: {
        type: 'type',
        label: 'Type',
        category: NODE_CATEGORIES.BROWSER,
        icon: Terminal,
        description: 'Type into field',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    x_advanced_search: {
        type: 'x_advanced_search',
        label: 'X Search',
        category: NODE_CATEGORIES.X,
        icon: Search,
        description: 'Advanced search for posts on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Search Results', value: 'items', example: '[{ id: "123", text: "..." }]' },
            { label: 'Total Count', value: 'count', example: '50' }
        ]
    },
    x_scout: {
        type: 'x_scout',
        label: 'X Scout',
        category: NODE_CATEGORIES.X,
        icon: Globe,
        description: 'Scout Niches, Communities, or Competitor Audiences',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Accounts Found', value: 'accounts', example: '@founder1 @indie_maker' },
            { label: 'Trending Topics', value: 'topics', example: '#saas #ai' }
        ]
    },
    x_profile: {
        type: 'x_profile',
        label: 'X Profile',
        category: NODE_CATEGORIES.X,
        icon: User,
        description: 'Qualify leads or check your identity.',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Handle', value: 'handle', example: '@elonmusk' },
            { label: 'Followers', value: 'followers', example: '100000' },
            { label: 'Bio', value: 'bio', example: 'Tech Fan' },
            { label: 'Is Verified', value: 'is_verified', example: 'true' }
        ]
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
    x_scan_posts: {
        type: 'x_scan_posts',
        label: 'X Scan',
        category: NODE_CATEGORIES.X,
        icon: Eye,
        description: 'Identify 10-15 posts and authors in one go',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Posts Found', value: 'posts', example: '[{ author: "@user", text: "..." }]' },
            { label: 'Total Count', value: 'count', example: '12' }
        ]
    },
    x_dm: {
        type: 'x_dm',
        label: 'X DM',
        category: NODE_CATEGORIES.X,
        icon: Send,
        description: 'Send a direct message to a user on X',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_switch_tab: {
        type: 'x_switch_tab',
        label: 'X Switch Tab',
        category: NODE_CATEGORIES.X,
        icon: Layers,
        description: 'Switch between "For you" and "Following" tabs',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_analyze_notifications: {
        type: 'x_analyze_notifications',
        label: 'X Notifications',
        category: NODE_CATEGORIES.X,
        icon: Bell,
        description: 'Analyze recent interactions (likes, mentions, follows)',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1,
        outputs_schema: [
            { label: 'Count', value: 'count', example: '20' },
            { label: 'Notifications', value: 'notifications', example: '[]' }
        ]
    }
};
