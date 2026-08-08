"use client";
import {
  LayoutDashboard, Users, CheckCheck, Briefcase, Sparkles, Radio, Target,
  Search, LayoutGrid, BookOpen, Brain, Map, Command, MessageSquare,
  ArrowRight, Coffee, Inbox, Activity, HeartPulse, X, Menu, CircleDot,
  Clock, Mail, FileText, ChevronRight, ChevronUp, ChevronDown, Bot, Workflow,
  Settings, Gauge, Calendar, Server, CircleDollarSign, ShieldCheck, Sun,
  Moon, Pause, Columns3, ArrowUpRight,
  Radar, Rss, Columns2, Wand, Wrench, Bell, Keyboard, Wallet, Receipt, Scale,
  TrendingUp, TrendingDown, AlertTriangle, Trophy, Filter, Hourglass, Globe,
  Home, MessagesSquare, ListChecks, FolderTree, Network, BarChart3,
  Plus, Send, Paperclip, Mic, Save, RefreshCw, ArrowUp, Power,
  type LucideProps,
} from "lucide-react";

const MAP = {
  LayoutDashboard, Users, CheckCheck, Briefcase, Sparkles, Radio, Target,
  Search, LayoutGrid, BookOpen, Brain, Map, Command, MessageSquare,
  ArrowRight, Coffee, Inbox, Activity, HeartPulse, X, Menu, CircleDot,
  Clock, Mail, FileText, ChevronRight, ChevronUp, ChevronDown, Bot, Workflow,
  Settings, Gauge, Calendar, Server, CircleDollarSign, ShieldCheck, Sun,
  Moon, Pause, Columns3, ArrowUpRight,
  Radar, Rss, Columns2, Wand, Wrench, Bell, Keyboard, Wallet, Receipt, Scale,
  TrendingUp, TrendingDown, AlertTriangle, Trophy, Filter, Hourglass, Globe,
  Home, MessagesSquare, ListChecks, FolderTree, Network, BarChart3,
  Plus, Send, Paperclip, Mic, Save, RefreshCw, ArrowUp, Power,
} as const;

export type IconName = keyof typeof MAP;

export default function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = MAP[name as IconName] ?? CircleDot;
  // Glass-glød: let skygge giver ikonerne dybde uden at ændre stilen.
  // Sættes kun hvis ingen eksplicit dropShadow/color er givet oppefra.
  return (
    <Cmp
      {...props}
      style={{
        filter: "drop-shadow(0 1px 1px rgba(23,24,22,0.12))",
        ...(props.style ?? {}),
      }}
    />
  );
}