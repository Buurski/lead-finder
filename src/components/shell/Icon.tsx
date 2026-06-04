"use client";
import {
  LayoutDashboard, Users, CheckCheck, Briefcase, Sparkles, Radio, Target,
  Search, LayoutGrid, BookOpen, Brain, Map, Command, MessageSquare,
  ArrowRight, Coffee, Inbox, Activity, HeartPulse, X, Menu, CircleDot,
  Clock, Mail, FileText, ChevronRight, Bot, Workflow,
  type LucideProps,
} from "lucide-react";

const MAP = {
  LayoutDashboard, Users, CheckCheck, Briefcase, Sparkles, Radio, Target,
  Search, LayoutGrid, BookOpen, Brain, Map, Command, MessageSquare,
  ArrowRight, Coffee, Inbox, Activity, HeartPulse, X, Menu, CircleDot,
  Clock, Mail, FileText, ChevronRight, Bot, Workflow,
} as const;

export type IconName = keyof typeof MAP;

export default function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = MAP[name as IconName] ?? CircleDot;
  return <Cmp {...props} />;
}
