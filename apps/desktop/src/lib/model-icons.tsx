import { IconBot } from "../components/icons";

type ProviderIconDefinition = {
  symbol: string;
  color: boolean;
};

/** Provider ids used by pi-ai, models.dev, and common compatible gateways. */
const PROVIDER_ICONS: Readonly<Record<string, ProviderIconDefinition>> = {
  anthropic: { symbol: "anthropic", color: false },
  openai: { symbol: "openai", color: false },
  "openai-codex": { symbol: "openai", color: false },
  google: { symbol: "google", color: true },
  "google-vertex": { symbol: "google", color: true },
  "ant-ling": { symbol: "antgroup", color: true },
  deepseek: { symbol: "deepseek", color: true },
  groq: { symbol: "groq", color: false },
  mistral: { symbol: "mistral", color: true },
  moonshotai: { symbol: "moonshot", color: false },
  "moonshotai-cn": { symbol: "moonshot", color: false },
  moonshot: { symbol: "moonshot", color: false },
  minimax: { symbol: "minimax", color: true },
  "minimax-cn": { symbol: "minimax", color: true },
  fireworks: { symbol: "fireworks", color: true },
  huggingface: { symbol: "huggingface", color: true },
  cerebras: { symbol: "cerebras", color: true },
  openrouter: { symbol: "openrouter", color: false },
  xai: { symbol: "xai", color: false },
  "cloudflare-ai-gateway": { symbol: "cloudflare", color: true },
  "cloudflare-workers-ai": { symbol: "cloudflare", color: true },
  "vercel-ai-gateway": { symbol: "vercel", color: false },
  "github-copilot": { symbol: "githubcopilot", color: false },
  "amazon-bedrock": { symbol: "aws", color: true },
  "azure-openai-responses": { symbol: "azure", color: true },
  "kimi-coding": { symbol: "kimi", color: true },
  nvidia: { symbol: "nvidia", color: true },
  opencode: { symbol: "opencode", color: false },
  "opencode-go": { symbol: "opencode", color: false },
  qwen: { symbol: "qwen", color: true },
  xiaomi: { symbol: "xiaomimimo", color: false },
  "xiaomi-token-plan-ams": { symbol: "xiaomimimo", color: false },
  "xiaomi-token-plan-cn": { symbol: "xiaomimimo", color: false },
  "xiaomi-token-plan-sgp": { symbol: "xiaomimimo", color: false },
  zai: { symbol: "zai", color: false },
  "zai-coding-cn": { symbol: "zai", color: false },
  zhipu: { symbol: "zhipu", color: true },
  cohere: { symbol: "cohere", color: true },
  perplexity: { symbol: "perplexity", color: true },
  together: { symbol: "together", color: true },
  grok: { symbol: "grok", color: false },
};

const MODEL_ICON_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:claude|anthropic)\b/i, "anthropic"],
  [/\b(?:gpt|chatgpt|codex|o[1-9](?:[-.]\d+)?)\b/i, "openai"],
  [/\b(?:gemini|gemma)\b/i, "google"],
  [/\bdeepseek\b/i, "deepseek"],
  [/\b(?:grok|xai)\b/i, "grok"],
  [/\b(?:qwen|通义)\b/i, "qwen"],
  [/\b(?:glm|chatglm|智谱)\b/i, "zhipu"],
  [/\b(?:mistral|mixtral)\b/i, "mistral"],
  [/\b(?:kimi|moonshot)\b/i, "moonshot"],
  [/\bminimax\b/i, "minimax"],
];

/** Resolve a sprite symbol from model text first, then from the provider id. */
export function resolveModelIconSymbol(
  provider: string,
  modelId: string,
  modelName?: string,
): string | undefined {
  const text = `${modelId} ${modelName ?? ""}`;
  return (
    MODEL_ICON_RULES.find(([pattern]) => pattern.test(text))?.[1] ??
    PROVIDER_ICONS[provider.trim().toLowerCase()]?.symbol
  );
}

function SpriteIcon({
  symbol,
  color,
  size,
}: {
  symbol: string;
  color: boolean;
  size: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color ? undefined : "currentColor"}
      style={{ color: "var(--text-muted)", flexShrink: 0 }}
    >
      <use href={`/provider-icons.svg#${symbol}`} />
    </svg>
  );
}

/** Model-aware icon with the existing bot glyph as the unknown-model fallback. */
export function ModelIcon({
  provider,
  modelId,
  modelName,
  size = 14,
}: {
  provider: string;
  modelId: string;
  modelName?: string;
  size?: number;
}) {
  const symbol = resolveModelIconSymbol(provider, modelId, modelName);
  const icon = symbol ? Object.values(PROVIDER_ICONS).find((entry) => entry.symbol === symbol) : undefined;
  if (!symbol || !icon) return <IconBot size={size} aria-hidden="true" />;
  return <SpriteIcon symbol={symbol} color={icon.color} size={size} />;
}
