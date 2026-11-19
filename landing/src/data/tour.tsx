import { CalendarIcon, CanvasIcon, GlobeIcon, KeyIcon, PhoneIcon } from '@/components/tour/icons';
import { AccountsFooter, AccountsScene } from '@/components/tour/tabs/accounts';
import { AutomationScene } from '@/components/tour/tabs/automation';
import { BrowserScene } from '@/components/tour/tabs/browser';
import { CanvasScene } from '@/components/tour/tabs/canvas';
import { RemoteScene } from '@/components/tour/tabs/remote';
import type { TourTab } from '@/components/tour/types';

/**
 * Feature tour tabs, in order (plan Q8/Q9). Copy comes from the Paper
 * "Feature tour · All states (full stage)" frames. The scenes live in
 * components/tour/tabs; this file holds the data so those files export only
 * components (Fast Refresh keeps their state).
 */
export const TOUR_TABS: TourTab[] = [
  {
    id: 'accounts',
    label: 'Accounts',
    icon: <KeyIcon />,
    title: 'Never stop at a usage limit',
    description:
      'Sign in to several Claude and ChatGPT accounts. When a chat reaches its limit, Troupe continues it on the account with the most room. Your draft is kept.',
    steps: ['Near the limit', 'Limit reached, draft kept', 'Switching to Personal', 'Continued on Personal'],
    footer: <AccountsFooter />,
    background: 'dusk',
    Scene: AccountsScene,
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: <CanvasIcon />,
    title: 'Watch the agent design',
    description:
      'Troupe Canvas is a full design editor in a tab. The agent builds frames and layers with its canvas tools, and you can change all of it after.',
    steps: ['An empty page', 'The agent adds a frame', 'Layers appear one by one', 'It selects the button'],
    background: 'green',
    Scene: CanvasScene,
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: <CalendarIcon />,
    title: 'Turn a repeat into a routine',
    description:
      'Troupe notices the work you ask for again and again. You approve exactly what the automation may do, then it runs on its own schedule.',
    steps: ['Troupe spots a repeat', 'You review what it may do', 'It runs at 9:00 on its own', 'Done, every weekday'],
    background: 'green',
    Scene: AutomationScene,
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: <GlobeIcon />,
    title: 'Checked in a real browser',
    description:
      'The agent opens your app in a visible tab beside the chat, clicks through it and sees what breaks. Passwords, uploads and new sites ask you first.',
    steps: ['The agent reaches for the browser', 'A visible tab beside the chat', 'You stay in control', 'Fixed and checked again'],
    background: 'pastel',
    Scene: BrowserScene,
  },
  {
    id: 'remote',
    label: 'Remote',
    icon: <PhoneIcon />,
    title: 'Keep going from your phone',
    description:
      'Turn on remote access and scan the QR. The same live chats open on your phone, on any network. Approve a command from anywhere.',
    steps: ['One switch on the desktop', 'Scan the QR', 'The same chat, on your phone', 'Approve from anywhere'],
    background: 'orange',
    frame: 'none',
    Scene: RemoteScene,
  },
];
