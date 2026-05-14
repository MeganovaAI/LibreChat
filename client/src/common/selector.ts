import React from 'react';
import { TStartupConfig } from 'librechat-data-provider';

export interface Endpoint {
  value: string;
  label: string;
  hasModels: boolean;
  models?: Array<{ name: string; isGlobal?: boolean }>;
  icon: React.ReactNode;
  agentNames?: Record<string, string>;
  assistantNames?: Record<string, string>;
  modelIcons?: Record<string, string | undefined>;
}

export interface SelectedValues {
  endpoint: string | null;
  model: string | null;
  modelSpec: string | null;
}

export interface ModelSelectorProps {
  startupConfig: TStartupConfig | undefined;
  /**
   * Conversation index this selector drives. Default 0 (the primary pane).
   * Set to 1 (or higher) to drive a side-by-side / multi-convo pane.
   */
  index?: number;
}
