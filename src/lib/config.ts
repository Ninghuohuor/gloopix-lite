export type PublicConfig = {
  siteName: string;
  siteDescription: string;
  modelName: string;
  apiProtocol: "openai" | "apimart";
  configured: boolean;
};

function value(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export function getServerConfig() {
  return {
    siteName: value("SITE_NAME", "Gloopix Lite"),
    siteDescription: value("SITE_DESCRIPTION", "只属于你的 AI 生图工作台"),
    accessPassword: value("ACCESS_PASSWORD"),
    sessionSecret: value("SESSION_SECRET"),
    apiKey: value("IMAGE_API_KEY"),
    apiBaseUrl: value("IMAGE_API_BASE_URL", "https://api.openai.com/v1"),
    apiProtocol: value("IMAGE_API_PROTOCOL") === "apimart" ? "apimart" as const : "openai" as const,
    model: value("IMAGE_MODEL", "gpt-image-2"),
    generationsPath: value("IMAGE_API_GENERATIONS_PATH", "/images/generations"),
    editsPath: value("IMAGE_API_EDITS_PATH", "/images/edits"),
    squareSize: value("IMAGE_SIZE_SQUARE", "1024x1024"),
    landscapeSize: value("IMAGE_SIZE_LANDSCAPE", "1536x1024"),
    portraitSize: value("IMAGE_SIZE_PORTRAIT", "1024x1536"),
  };
}

export function getPublicConfig(): PublicConfig {
  const config = getServerConfig();
  return {
    siteName: config.siteName,
    siteDescription: config.siteDescription,
    modelName: config.model,
    apiProtocol: config.apiProtocol,
    configured: Boolean(
      config.accessPassword && config.sessionSecret && config.apiKey && config.apiBaseUrl
    ),
  };
}
