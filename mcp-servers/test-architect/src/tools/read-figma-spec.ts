import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const homeDir = process.env.USERPROFILE || process.env.HOME || '';
const FIGMA_TOKEN_PATH = resolve(homeDir, '.claude', 'figma-token.json');

function loadToken(tokenOverride?: string): string {
  if (tokenOverride) return tokenOverride;
  if (existsSync(FIGMA_TOKEN_PATH)) {
    const data = JSON.parse(readFileSync(FIGMA_TOKEN_PATH, 'utf-8'));
    if (data.token) return data.token;
  }
  throw new Error(
    'Figma token not found. Run setup.js to configure, or pass figma_token explicitly.'
  );
}

function extractFileKey(input: string): string {
  // Accept full URL or bare file key
  const m = input.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]+$/.test(input)) return input;
  throw new Error(`Cannot extract file key from: ${input}`);
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  characters?: string;
  fills?: unknown[];
  style?: Record<string, unknown>;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

export interface FigmaScreen {
  id: string;
  name: string;
  type: string;
  textContent: string[];
  children: string[];
}

export interface FigmaSpecResult {
  fileKey: string;
  fileName: string;
  screens: FigmaScreen[];
  /** Flat list of component/frame names — dùng như spec feature list */
  featureList: string[];
}

function collectTexts(node: FigmaNode): string[] {
  const texts: string[] = [];
  if (node.type === 'TEXT' && node.characters) {
    texts.push(node.characters.trim());
  }
  for (const child of node.children ?? []) {
    texts.push(...collectTexts(child));
  }
  return texts.filter(Boolean);
}

function mapScreen(node: FigmaNode): FigmaScreen {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    textContent: collectTexts(node),
    children: (node.children ?? []).map((c) => c.name),
  };
}

export async function readFigmaSpec(
  figmaUrl: string,
  nodeId?: string,
  figmaToken?: string
): Promise<FigmaSpecResult> {
  const token = loadToken(figmaToken);
  const fileKey = extractFileKey(figmaUrl);

  const base = `https://api.figma.com/v1/files/${fileKey}`;
  const url = nodeId ? `${base}/nodes?ids=${encodeURIComponent(nodeId)}` : base;

  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as any;

  let topNodes: FigmaNode[] = [];

  if (nodeId) {
    // nodes endpoint: { nodes: { [id]: { document: FigmaNode } } }
    topNodes = Object.values(data.nodes ?? {}).map((n: any) => n.document as FigmaNode);
  } else {
    // full file: traverse document → canvas → frames/components
    const canvas: FigmaNode[] = data?.document?.children ?? [];
    for (const page of canvas) {
      topNodes.push(...(page.children ?? []));
    }
  }

  // Only keep FRAME, COMPONENT, COMPONENT_SET as "screens"
  const screenTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'GROUP']);
  const screens = topNodes
    .filter((n) => screenTypes.has(n.type))
    .map(mapScreen);

  return {
    fileKey,
    fileName: data?.name ?? fileKey,
    screens,
    featureList: screens.map((s) => s.name),
  };
}
