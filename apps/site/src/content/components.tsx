import defaultComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Accordions, Accordion } from 'fumadocs-ui/components/accordion';
import { Files, File, Folder } from 'fumadocs-ui/components/files';
import { componentRegistry } from './registry';
export const components = {
  ...defaultComponents,
  Callout,
  Card,
  Cards,
  Tabs,
  Tab,
  Steps,
  Step,
  Accordions,
  Accordion,
  Files,
  File,
  Folder,
};
// Adding a registry entry without a renderer fails type checking.
const registered: Record<keyof typeof componentRegistry, unknown> = components;
void registered;
