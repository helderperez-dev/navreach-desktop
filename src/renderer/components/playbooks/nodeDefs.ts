
import {
    Play, Square, HelpCircle, Repeat, Clock,
    List, Sparkles, Filter,
    Globe, Search, MessageCircle, FileText,
    Cpu, Webhook, MousePointer,
    CheckCircle, PauseCircle,
    Heart, Reply, Send, UserPlus, MessagesSquare, MoveDown, Wand2, Users,
    Eye, Terminal, Layers
} from 'lucide-react';
import { PlaybookNodeType } from '@/types/playbook';

export const NODE_CATEGORIES = {
    CONTROL: 'Control',
    TARGET: 'Target source',
    ACTION: 'Action',
    BROWSER: 'Browser',
    X: 'X (Twitter)',
    REDDIT: 'Reddit',
    LINKEDIN: 'LinkedIn',
    INSTAGRAM: 'Instagram',
    BLUESKY: 'Bluesky',
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
    browser_accessibility_tree: {
        type: 'browser_accessibility_tree',
        label: 'AX Tree',
        category: NODE_CATEGORIES.BROWSER,
        icon: Layers,
        description: 'Analyze semantic structure',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_inspect: {
        type: 'browser_inspect',
        label: 'Inspect',
        category: NODE_CATEGORIES.BROWSER,
        icon: Search,
        description: 'Deep element analysis',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_highlight: {
        type: 'browser_highlight',
        label: 'Highlight',
        category: NODE_CATEGORIES.BROWSER,
        icon: Eye,
        description: 'Visually mark elements',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_console_logs: {
        type: 'browser_console_logs',
        label: 'Logs',
        category: NODE_CATEGORIES.BROWSER,
        icon: Terminal,
        description: 'Get page errors/logs',
        color: 'bg-blue-500/10 text-blue-500',
        inputs: 1,
        outputs: 1
    },
    browser_grid: {
        type: 'browser_grid',
        label: 'Grid',
        category: NODE_CATEGORIES.BROWSER,
        icon: List,
        description: 'Overlay coordinate grid',
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
    x_scout_topics: {
        type: 'x_scout_topics',
        label: 'X Scout',
        category: NODE_CATEGORIES.X,
        icon: Globe,
        description: 'Auto-discover accounts/hashtags',
        color: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
        inputs: 1,
        outputs: 1
    },
    x_scout_community: {
        type: 'x_scout_community',
        label: 'X Community',
        category: NODE_CATEGORIES.X,
        icon: Users,
        description: 'Scout specific X Communities',
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
    reddit_search: {
        type: 'reddit_search',
        label: 'Reddit Search',
        category: NODE_CATEGORIES.REDDIT,
        icon: Search,
        description: 'Search Reddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_scout_community: {
        type: 'reddit_scout_community',
        label: 'Scout Sub',
        category: NODE_CATEGORIES.REDDIT,
        icon: Users,
        description: 'Scout a Subreddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_vote: {
        type: 'reddit_vote',
        label: 'Reddit Vote',
        category: NODE_CATEGORIES.REDDIT,
        icon: Heart,
        description: 'Up/Down vote',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_comment: {
        type: 'reddit_comment',
        label: 'Reddit Comment',
        category: NODE_CATEGORIES.REDDIT,
        icon: MessageCircle,
        description: 'Comment or Reply',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    reddit_join: {
        type: 'reddit_join',
        label: 'Reddit Join',
        category: NODE_CATEGORIES.REDDIT,
        icon: UserPlus,
        description: 'Join/Leave Subreddit',
        color: 'bg-[#FF4500]/10 text-[#FF4500]',
        inputs: 1,
        outputs: 1
    },
    // LinkedIn Nodes
    linkedin_search: {
        type: 'linkedin_search',
        label: 'LI Search',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: Search,
        description: 'Search LinkedIn',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    linkedin_connect: {
        type: 'linkedin_connect',
        label: 'LI Connect',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: UserPlus,
        description: 'Connect with user',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    linkedin_message: {
        type: 'linkedin_message',
        label: 'LI Message',
        category: NODE_CATEGORIES.LINKEDIN,
        icon: Send,
        description: 'Send direct message',
        color: 'bg-[#0077b5]/10 text-[#0077b5]',
        inputs: 1,
        outputs: 1
    },
    // Instagram Nodes
    instagram_post: {
        type: 'instagram_post',
        label: 'IG Post',
        category: NODE_CATEGORIES.INSTAGRAM,
        icon: Send,
        description: 'Create new post',
        color: 'bg-[#E1306C]/10 text-[#E1306C]',
        inputs: 1,
        outputs: 1
    },
    instagram_engage: {
        type: 'instagram_engage',
        label: 'IG Engage',
        category: NODE_CATEGORIES.INSTAGRAM,
        icon: Heart,
        description: 'Like or Comment',
        color: 'bg-[#E1306C]/10 text-[#E1306C]',
        inputs: 1,
        outputs: 1
    },
    // Bluesky Nodes
    bluesky_post: {
        type: 'bluesky_post',
        label: 'BSKY Post',
        category: NODE_CATEGORIES.BLUESKY,
        icon: Send,
        description: 'Post to Bluesky',
        color: 'bg-[#0560FF]/10 text-[#0560FF]',
        inputs: 1,
        outputs: 1
    },
    bluesky_reply: {
        type: 'bluesky_reply',
        label: 'BSKY Reply',
        category: NODE_CATEGORIES.BLUESKY,
        icon: Reply,
        description: 'Reply to post',
        color: 'bg-[#0560FF]/10 text-[#0560FF]',
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
