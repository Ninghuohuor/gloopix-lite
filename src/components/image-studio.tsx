"use client";

/* eslint-disable @next/next/no-img-element */
import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Copy, Download, Eye, EyeOff, HardDrive, History as HistoryIcon, ImageUp, LogOut, Moon, Paperclip, Plus, Settings, Sun, Trash2, X } from "lucide-react";
import type { PublicConfig } from "@/lib/config";
import type { AspectRatio } from "@/lib/image-provider";
import { loadLocalBranding, renameBrandingSite, saveLocalBranding, validateBrandingAsset, type BrandingSettings } from "@/lib/local-branding";
import { clearLocalHistory, deleteLocalHistory, formatStorageBytes, getLocalHistoryStats, listLocalHistory, requestPersistentLocalHistory, saveLocalHistory, type LocalHistoryRecord, type LocalHistoryStats } from "@/lib/local-history";
import { AUTO_SIZE_OPTION, isValidSizeValue, modelSizeTemplate, validSizeOptions, type ModelSizeOption } from "@/lib/model-sizes";

type Status = "checking" | "locked" | "ready";
type Theme = "light" | "dark";
type SettingsSection = "branding" | "api" | "security";
type ImageQuality = "low" | "medium" | "high";
type ImageResolution = "1k" | "2k" | "4k";
type Reference = { name: string; dataUrl: string };
type ModelSetting = {
  key: string;
  id: string;
  name: string;
  supportsQuality: boolean;
  supportsResolution: boolean;
  defaultQuality: ImageQuality;
  defaultResolution: ImageResolution;
  supportedResolutions: ImageResolution[];
  defaultSizeKey: string;
  sizeOptions: ModelSizeOption[];
};
type ApiProviderSetting = {
  key: string;
  name: string;
  protocol: "openai" | "apimart";
  apiBaseUrl: string;
  apiKey: string;
  generationsPath: string;
  editsPath: string;
  models: ModelSetting[];
};
type ApiSettings = { providers: ApiProviderSetting[] };
type Message = {
  id: string;
  prompt: string;
  aspectRatio: AspectRatio;
  reference?: Reference;
  quantity: number;
  status: "generating" | "completed" | "failed";
  imageUrls?: string[];
  error?: string;
  modelLabel: string;
  quality?: ImageQuality;
  resolution?: ImageResolution;
  sizeLabel: string;
};
type HistoryView = LocalHistoryRecord & { imageUrls: string[] };

const SETTINGS_STORAGE_KEY = "gloopix-lite-api-settings";
const SELECTED_MODEL_STORAGE_KEY = "gloopix-lite-selected-model";
const SERVER_MODEL_KEY = "__server__";

function defaultBranding(config: PublicConfig): BrandingSettings {
  return {
    siteName: config.siteName,
    browserTitle: config.siteName,
    browserTitleCustomized: false,
    siteDescription: config.siteDescription,
    logoText: config.siteName,
    logoTextCustomized: false,
  };
}

function newModel(id = "gpt-image-2", name = "GPT Image 2", protocol: "openai" | "apimart" = "openai"): ModelSetting {
  const sizeOptions = modelSizeTemplate(id, protocol);
  return {
    key: crypto.randomUUID(),
    id,
    name,
    supportsQuality: false,
    supportsResolution: true,
    defaultQuality: "low",
    defaultResolution: "1k",
    supportedResolutions: id === "gpt-image-2" ? protocol === "apimart" ? ["1k", "2k", "4k"] : ["1k", "2k"] : ["1k"],
    defaultSizeKey: "auto",
    sizeOptions,
  };
}

function newProvider(index = 1): ApiProviderSetting {
  return {
    key: crypto.randomUUID(),
    name: `API ${index}`,
    protocol: "openai",
    apiBaseUrl: "https://api.openai.com/v1",
    apiKey: "",
    generationsPath: "/images/generations",
    editsPath: "/images/edits",
    models: [newModel()],
  };
}

function defaultApiSettings(): ApiSettings {
  return { providers: [newProvider()] };
}

function modelSelectionKey(providerKey: string, modelKey: string) {
  return `${providerKey}::${modelKey}`;
}

function validModels(value: unknown, protocol: "openai" | "apimart"): ModelSetting[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((model) => {
    if (!model || typeof model !== "object") return [];
    const candidate = model as Partial<ModelSetting>;
    if (typeof candidate.key !== "string" || typeof candidate.id !== "string" || typeof candidate.name !== "string") return [];
    const supportedResolutions: ImageResolution[] = Array.isArray(candidate.supportedResolutions)
      ? candidate.supportedResolutions.filter((item): item is ImageResolution => item === "1k" || item === "2k" || item === "4k")
      : ["1k", "2k"];
    const sizeOptions = validSizeOptions(candidate.sizeOptions, candidate.id, protocol);
    const defaultSizeKey = typeof candidate.defaultSizeKey === "string" && sizeOptions.some((option) => option.key === candidate.defaultSizeKey) ? candidate.defaultSizeKey : "auto";
    return [{
      key: candidate.key,
      id: candidate.id,
      name: candidate.name,
      supportsQuality: candidate.supportsQuality ?? false,
      supportsResolution: candidate.supportsResolution ?? true,
      defaultQuality: candidate.defaultQuality === "medium" || candidate.defaultQuality === "high" ? candidate.defaultQuality : "low",
      defaultResolution: candidate.defaultResolution === "2k" || candidate.defaultResolution === "4k" ? candidate.defaultResolution : "1k",
      supportedResolutions: supportedResolutions.length ? supportedResolutions : ["1k"],
      defaultSizeKey,
      sizeOptions,
    }];
  });
}

function findLocalSelection(settings: ApiSettings, value: string) {
  return settings.providers.flatMap((provider) => provider.models.map((model) => ({ provider, model, value: modelSelectionKey(provider.key, model.key) }))).find((item) => item.value === value);
}

function readStoredSettings(): ApiSettings | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "null") as (Partial<ApiSettings> & Partial<ApiProviderSetting>) | null;
    if (!parsed) return;
    const rawProviders = Array.isArray(parsed.providers)
      ? parsed.providers
      : typeof parsed.apiBaseUrl === "string"
        ? [{ ...parsed, key: crypto.randomUUID(), name: "API 1" }]
        : [];
    const providers = rawProviders.flatMap((provider) => {
      if (!provider || typeof provider !== "object") return [];
      const candidate = provider as Partial<ApiProviderSetting>;
      const protocol: ApiProviderSetting["protocol"] = candidate.protocol === "apimart" ? "apimart" : "openai";
      const models = validModels(candidate.models, protocol);
      if (typeof candidate.apiBaseUrl !== "string" || typeof candidate.apiKey !== "string" || !models.length) return [];
      return [{
        key: typeof candidate.key === "string" ? candidate.key : crypto.randomUUID(),
        name: typeof candidate.name === "string" ? candidate.name : "API",
        protocol,
        apiBaseUrl: candidate.apiBaseUrl,
        apiKey: candidate.apiKey,
        generationsPath: typeof candidate.generationsPath === "string" ? candidate.generationsPath : "/images/generations",
        editsPath: typeof candidate.editsPath === "string" ? candidate.editsPath : "/images/edits",
        models,
      }];
    });
    return providers.length ? { providers } : undefined;
  } catch {
    return;
  }
}

const qualityOptions: { id: ImageQuality; label: string }[] = [
  { id: "low", label: "Low（更快、更省）" },
  { id: "medium", label: "Medium（质量与消耗折中）" },
  { id: "high", label: "High（质量更高、消耗更高）" },
];

async function readError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export function ImageStudio({ config }: { config: PublicConfig }) {
  const [status, setStatus] = useState<Status>("checking");
  const [theme, setTheme] = useState<Theme>("dark");
  const [password, setPassword] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedSizeKey, setSelectedSizeKey] = useState("auto");
  const [resolution, setResolution] = useState<ImageResolution>("1k");
  const [quantity, setQuantity] = useState(1);
  const [quality, setQuality] = useState<ImageQuality>("low");
  const [reference, setReference] = useState<Reference>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [preview, setPreview] = useState<{ url: string; alt: string }>();
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => defaultApiSettings());
  const [draftSettings, setDraftSettings] = useState<ApiSettings>(() => defaultApiSettings());
  const [selectedModel, setSelectedModel] = useState(SERVER_MODEL_KEY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("branding");
  const [settingsError, setSettingsError] = useState("");
  const [currentAccessPassword, setCurrentAccessPassword] = useState("");
  const [newAccessPassword, setNewAccessPassword] = useState("");
  const [confirmAccessPassword, setConfirmAccessPassword] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<BrandingSettings>(() => defaultBranding(config));
  const [draftBranding, setDraftBranding] = useState<BrandingSettings>(() => defaultBranding(config));
  const [brandingError, setBrandingError] = useState("");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [draftLogoUrl, setDraftLogoUrl] = useState("");
  const [draftFaviconUrl, setDraftFaviconUrl] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryView[]>([]);
  const [historyStats, setHistoryStats] = useState<LocalHistoryStats>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const historyUrls = useRef<string[]>([]);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const stored = readStoredSettings();
    if (stored) {
      setApiSettings(stored);
      setDraftSettings(stored);
      const savedSelection = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
      const availableSelections = stored.providers.flatMap((provider) => provider.models.map((model) => modelSelectionKey(provider.key, model.key)));
      const migratedSelection = stored.providers.flatMap((provider) => provider.models.map((model) => ({ model, value: modelSelectionKey(provider.key, model.key) }))).find(({ model }) => model.key === savedSelection)?.value;
      const nextSelection = savedSelection && availableSelections.includes(savedSelection) ? savedSelection : (migratedSelection || availableSelections[0]);
      setSelectedModel(nextSelection);
      const selected = findLocalSelection(stored, nextSelection);
      if (selected) {
        setQuality(selected.model.defaultQuality);
        setSelectedSizeKey(selected.model.defaultSizeKey);
        setResolution(selected.model.defaultResolution);
      }
    }
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { authenticated?: boolean }) => setStatus(data.authenticated ? "ready" : "locked"))
      .catch(() => setStatus("locked"));
    void loadLocalBranding(defaultBranding(config)).then((stored) => {
      setBranding(stored);
      setDraftBranding(stored);
    }).catch(() => undefined);
  }, [config]);

  useEffect(() => {
    const logoUrl = branding.logoImage ? URL.createObjectURL(branding.logoImage) : "";
    const faviconUrl = branding.favicon ? URL.createObjectURL(branding.favicon) : "";
    setBrandingLogoUrl(logoUrl);
    document.title = branding.browserTitle || branding.siteName;
    const existingIcon = document.querySelector<HTMLLinkElement>('link[data-local-branding="favicon"]');
    if (faviconUrl) {
      const icon = existingIcon || document.createElement("link");
      icon.rel = "icon";
      icon.href = faviconUrl;
      icon.dataset.localBranding = "favicon";
      if (!existingIcon) document.head.appendChild(icon);
    } else {
      existingIcon?.remove();
    }
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (faviconUrl) URL.revokeObjectURL(faviconUrl);
    };
  }, [branding]);

  useEffect(() => {
    const logoUrl = draftBranding.logoImage ? URL.createObjectURL(draftBranding.logoImage) : "";
    const faviconUrl = draftBranding.favicon ? URL.createObjectURL(draftBranding.favicon) : "";
    setDraftLogoUrl(logoUrl);
    setDraftFaviconUrl(faviconUrl);
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (faviconUrl) URL.revokeObjectURL(faviconUrl);
    };
  }, [draftBranding.logoImage, draftBranding.favicon]);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    results.current?.scrollTo({ top: results.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!settingsOpen && !historyOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setHistoryOpen(false);
        historyUrls.current.forEach((url) => URL.revokeObjectURL(url));
        historyUrls.current = [];
        setHistoryRecords([]);
        setPreview(undefined);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, historyOpen]);

  useEffect(() => () => historyUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      window.localStorage.setItem("gloopix-lite-theme", next);
      return next;
    });
  }

  const themeButton = (
    <button type="button" className="header-icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到白昼模式" : "切换到黑夜模式"} title={theme === "dark" ? "白昼模式" : "黑夜模式"}>
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error(await readError(response, "无法进入工作台"));
      setPassword("");
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法进入工作台");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMessages([]);
    setStatus("locked");
  }

  function selectReference(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("参考图仅支持 PNG、JPEG 或 WebP");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("参考图不能超过 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReference({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => setError("读取参考图失败");
    reader.readAsDataURL(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (image) {
      event.preventDefault();
      selectReference(image);
    }
  }

  async function generate() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;
    const id = crypto.randomUUID();
    const currentReference = reference;
    const localSelection = findLocalSelection(apiSettings, selectedModel);
    const modelLabel = selectedModel === SERVER_MODEL_KEY ? config.modelName : localSelection ? `${localSelection.provider.name} / ${localSelection.model.name || localSelection.model.id}` : "未配置模型";
    const selectedQuality = localSelection?.model.supportsQuality ? quality : undefined;
    const selectedResolution = selectedModel === SERVER_MODEL_KEY && config.apiProtocol === "apimart" || localSelection?.provider.protocol === "apimart" && localSelection.model.supportsResolution ? resolution : undefined;
    const aspectRatio = selectedSize.shape as AspectRatio;
    const sizeLabel = selectedResolution ? `${selectedSize.label} · ${selectedResolution.toUpperCase()}` : selectedSize.label;
    const message: Message = { id, prompt: cleanPrompt, aspectRatio, quantity, quality: selectedQuality, sizeLabel, reference: currentReference, status: "generating", modelLabel };
    setMessages((current) => [...current, message]);
    setPrompt("");
    setReference(undefined);
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          aspectRatio,
          size: selectedSize.value,
          quantity,
          quality: selectedQuality,
          resolution: selectedResolution,
          referenceImage: currentReference?.dataUrl,
          provider: selectedModel === SERVER_MODEL_KEY ? undefined : {
            protocol: localSelection?.provider.protocol,
            apiKey: localSelection?.provider.apiKey,
            baseUrl: localSelection?.provider.apiBaseUrl,
            model: localSelection?.model.id,
            generationsPath: localSelection?.provider.generationsPath,
            editsPath: localSelection?.provider.editsPath,
          },
        }),
      });
      if (response.status === 401) {
        setStatus("locked");
        throw new Error("访问会话已失效，请重新输入密码");
      }
      if (!response.ok) throw new Error(await readError(response, "生成失败，请稍后再试"));
      const data = (await response.json()) as { imageUrl?: string; imageUrls?: string[] };
      const imageUrls = data.imageUrls?.length ? data.imageUrls : data.imageUrl ? [data.imageUrl] : [];
      if (!imageUrls.length) throw new Error("上游 API 未返回图片数据");
      setMessages((current) => current.map((item) => item.id === id ? { ...item, status: "completed", imageUrls } : item));
      try {
        const saved = await saveLocalHistory({ id, createdAt: Date.now(), prompt: cleanPrompt, modelLabel, aspectRatio, quality: selectedQuality, sizeLabel, imageUrls });
        await requestPersistentLocalHistory().catch(() => false);
        if (saved.removedCount) setHistoryNotice(`本地历史接近存储上限，已自动清理 ${saved.removedCount} 条最早记录。`);
        if (historyOpen) await loadHistory();
      } catch (historyFailure) {
        setError(`图片已生成，但未能保存到本地历史：${historyFailure instanceof Error ? historyFailure.message : "未知错误"}`);
      }
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "生成失败，请稍后再试";
      setMessages((current) => current.map((item) => item.id === id ? { ...item, status: "failed", error: reason } : item));
    } finally {
      setLoading(false);
    }
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void generate();
    }
  }

  function clearReference() {
    setReference(undefined);
    if (fileInput.current) fileInput.current.value = "";
  }

  function releaseHistoryUrls() {
    historyUrls.current.forEach((url) => URL.revokeObjectURL(url));
    historyUrls.current = [];
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const records = await listLocalHistory();
      releaseHistoryUrls();
      const views = records.map((record) => ({
        ...record,
        imageUrls: record.images.map((image) => {
          const url = URL.createObjectURL(image);
          historyUrls.current.push(url);
          return url;
        }),
      }));
      setHistoryRecords(views);
      setHistoryStats(await getLocalHistoryStats(records));
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "读取本地历史失败");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory() {
    setSettingsOpen(false);
    setHistoryOpen(true);
    setHistoryNotice("");
    void loadHistory();
  }

  function closeHistory() {
    setHistoryOpen(false);
    releaseHistoryUrls();
    setHistoryRecords([]);
    setPreview(undefined);
  }

  async function removeHistoryRecord(id: string) {
    try {
      await deleteLocalHistory(id);
      await loadHistory();
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "删除本地历史失败");
    }
  }

  async function removeAllHistory() {
    if (!window.confirm("确定清空当前浏览器中的全部生成历史吗？此操作无法撤销。")) return;
    try {
      await clearLocalHistory();
      await loadHistory();
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "清空本地历史失败");
    }
  }

  function openSettings() {
    closeHistory();
    setDraftSettings(structuredClone(apiSettings));
    setDraftBranding(branding);
    setSettingsError("");
    setBrandingError("");
    setCurrentAccessPassword("");
    setNewAccessPassword("");
    setConfirmAccessPassword("");
    setPasswordChangeError("");
    setPasswordChangeSuccess("");
    setSettingsSection("branding");
    setSettingsOpen(true);
  }

  async function saveAccessPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordChangeError("");
    setPasswordChangeSuccess("");
    if (newAccessPassword.length < 6 || newAccessPassword.length > 128) return setPasswordChangeError("新密码需为 6–128 个字符");
    if (newAccessPassword !== confirmAccessPassword) return setPasswordChangeError("两次输入的新密码不一致");
    setPasswordChanging(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentAccessPassword, newPassword: newAccessPassword }),
      });
      if (!response.ok) throw new Error(await readError(response, "修改访问密码失败"));
      setCurrentAccessPassword("");
      setNewAccessPassword("");
      setConfirmAccessPassword("");
      setPasswordChangeSuccess("访问密码已修改，其他设备需要重新登录。");
    } catch (caught) {
      setPasswordChangeError(caught instanceof Error ? caught.message : "修改访问密码失败");
    } finally {
      setPasswordChanging(false);
    }
  }

  function selectBrandingAsset(kind: "logo" | "favicon", file: File | undefined) {
    setBrandingError("");
    if (!file) return;
    const validationError = validateBrandingAsset(file, kind, file.name);
    if (validationError) return setBrandingError(validationError);
    setDraftBranding((current) => kind === "logo" ? { ...current, logoImage: file } : { ...current, favicon: file });
  }

  async function saveBrandingSettings(event: FormEvent) {
    event.preventDefault();
    setBrandingError("");
    const siteName = draftBranding.siteName.trim();
    const browserTitle = draftBranding.browserTitle.trim();
    const logoText = draftBranding.logoText.trim();
    if (!siteName) return setBrandingError("请填写网站名称");
    if (!browserTitle) return setBrandingError("请填写浏览器标题");
    if (!logoText && !draftBranding.logoImage) return setBrandingError("请填写 Logo 文字或选择 Logo 图片");
    const next: BrandingSettings = {
      ...draftBranding,
      siteName,
      browserTitle,
      siteDescription: draftBranding.siteDescription.trim(),
      logoText,
    };
    try {
      await saveLocalBranding(next);
      setBranding(next);
      setDraftBranding(next);
      setSettingsOpen(false);
    } catch (caught) {
      setBrandingError(caught instanceof Error ? caught.message : "保存基础信息失败");
    }
  }

  function patchDraftModel(providerKey: string, modelKey: string, patch: Partial<ModelSetting>) {
    setDraftSettings((current) => ({
      providers: current.providers.map((provider) => provider.key === providerKey
        ? { ...provider, models: provider.models.map((model) => model.key === modelKey ? { ...model, ...patch } : model) }
        : provider),
    }));
  }

  function patchDraftSize(providerKey: string, modelKey: string, sizeKey: string, patch: Partial<ModelSizeOption>) {
    setDraftSettings((current) => ({
      providers: current.providers.map((provider) => provider.key === providerKey
        ? { ...provider, models: provider.models.map((model) => model.key === modelKey ? { ...model, sizeOptions: model.sizeOptions.map((option) => option.key === sizeKey ? { ...option, ...patch } : option) } : model) }
        : provider),
    }));
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!draftSettings.providers.length) return setSettingsError("请至少添加一个 API");
    const providers: ApiProviderSetting[] = [];
    for (const [index, provider] of draftSettings.providers.entries()) {
      const name = provider.name.trim() || `API ${index + 1}`;
      const apiBaseUrl = provider.apiBaseUrl.trim();
      const apiKey = provider.apiKey.trim();
      const generationsPath = provider.generationsPath.trim();
      const editsPath = provider.editsPath.trim();
      for (const model of provider.models) {
        const invalidSize = model.sizeOptions.find((option) => option.value !== "auto" && (!option.label.trim() || !isValidSizeValue(option.value.trim())));
        if (invalidSize) return setSettingsError(`请检查「${model.name || model.id || "未命名模型"}」的自定义尺寸名称与 API 参数`);
      }
      const models = provider.models.map((model) => {
        const supportedResolutions = model.supportsResolution ? model.supportedResolutions : model.supportedResolutions.length ? model.supportedResolutions : ["1k" as const];
        const sizeOptions = validSizeOptions(model.sizeOptions.map((option) => ({ ...option, label: option.label.trim(), value: option.value.trim() })), model.id, provider.protocol);
        return {
          ...model,
          id: model.id.trim(),
          name: model.name.trim(),
          supportedResolutions,
          defaultResolution: supportedResolutions.includes(model.defaultResolution) ? model.defaultResolution : (supportedResolutions[0] || "1k"),
          sizeOptions,
          defaultSizeKey: sizeOptions.some((option) => option.key === model.defaultSizeKey) ? model.defaultSizeKey : "auto",
        };
      }).filter((model) => model.id);
      if (!apiKey) return setSettingsError(`请填写「${name}」的 API Key`);
      try {
        const url = new URL(apiBaseUrl);
        if (!/^https?:$/.test(url.protocol)) throw new Error();
      } catch {
        return setSettingsError(`「${name}」的 API 地址无效`);
      }
      if (!models.length) return setSettingsError(`请为「${name}」至少添加一个模型`);
      if (!generationsPath || !editsPath) return setSettingsError(`请填写「${name}」的接口路径`);
      providers.push({ ...provider, name, apiBaseUrl, apiKey, generationsPath, editsPath, models });
    }
    const next = { providers };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    const availableSelections = providers.flatMap((provider) => provider.models.map((model) => modelSelectionKey(provider.key, model.key)));
    const nextSelection = availableSelections.includes(selectedModel) ? selectedModel : availableSelections[0];
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, nextSelection);
    setApiSettings(next);
    setSelectedModel(nextSelection);
    setSelectedSizeKey(findLocalSelection(next, nextSelection)?.model.defaultSizeKey || "auto");
    setResolution(findLocalSelection(next, nextSelection)?.model.defaultResolution || "1k");
    setSettingsOpen(false);
    setSettingsError("");
  }

  const configuredProviders = apiSettings.providers.filter((provider) => provider.apiKey.trim() && provider.apiBaseUrl.trim() && provider.models.some((model) => model.id.trim()));
  const localConfigured = configuredProviders.length > 0;
  const selectedLocalModel = findLocalSelection({ providers: configuredProviders }, selectedModel);
  const serverSizeOptions = modelSizeTemplate(config.modelName, config.apiProtocol);
  const selectedSizeOptions = selectedModel === SERVER_MODEL_KEY
    ? serverSizeOptions
    : selectedLocalModel?.model.supportsResolution ? selectedLocalModel.model.sizeOptions : [{ ...AUTO_SIZE_OPTION }];
  const selectedSize = selectedSizeOptions.find((option) => option.key === selectedSizeKey) || selectedSizeOptions[0] || AUTO_SIZE_OPTION;
  const canGenerate = selectedModel === SERVER_MODEL_KEY ? config.configured : Boolean(selectedLocalModel?.model.id.trim());

  function selectModel(value: string) {
    setSelectedModel(value);
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, value);
    const selection = findLocalSelection(apiSettings, value);
    if (!selection) {
      setSelectedSizeKey("auto");
      return;
    }
    setQuality(selection.model.defaultQuality);
    setSelectedSizeKey(selection.model.defaultSizeKey);
    setResolution(selection.model.defaultResolution);
  }

  function renderComposer() {
    return (
      <div className="composer-wrap">
        <div className="composer-box">
          {reference && (
            <div className="composer-reference">
              <button type="button" onClick={() => setPreview({ url: reference.dataUrl, alt: reference.name })} aria-label={`预览参考图 ${reference.name}`}><img src={reference.dataUrl} alt={reference.name} /></button>
              <button type="button" className="remove-reference" onClick={clearReference} aria-label="移除参考图"><X aria-hidden="true" /></button>
            </div>
          )}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handlePromptKeyDown} onPaste={handlePaste} placeholder="描述你想要生成的图片..." rows={1} maxLength={2000} aria-label="图片描述" />
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { selectReference(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="composer-actions">
            <div className="composer-options">
              <select value={selectedModel} onChange={(event) => selectModel(event.target.value)} aria-label="模型">
                {config.configured && <option value={SERVER_MODEL_KEY}>{config.modelName}</option>}
                {configuredProviders.map((provider) => <optgroup key={provider.key} label={provider.name}>{provider.models.filter((model) => model.id.trim()).map((model) => <option key={model.key} value={modelSelectionKey(provider.key, model.key)}>{model.name || model.id}</option>)}</optgroup>)}
                {!config.configured && !localConfigured && <option value={SERVER_MODEL_KEY}>请先配置模型</option>}
              </select>
              <select value={selectedSize.key} onChange={(event) => setSelectedSizeKey(event.target.value)} aria-label="图片尺寸">
                {selectedSizeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              {(selectedModel === SERVER_MODEL_KEY && config.apiProtocol === "apimart" || selectedLocalModel?.provider.protocol === "apimart" && selectedLocalModel.model.supportsResolution) && <select value={resolution} onChange={(event) => setResolution(event.target.value as ImageResolution)} aria-label="输出分辨率">{(selectedLocalModel?.model.supportedResolutions || ["1k", "2k", "4k"]).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select>}
              {selectedLocalModel?.model.supportsQuality && <select className="quality-select" value={quality} onChange={(event) => setQuality(event.target.value as ImageQuality)} aria-label="生成质量">{qualityOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}
              <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} aria-label="生成张数">
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}
              </select>
              <button type="button" className="composer-icon-button" onClick={() => fileInput.current?.click()} aria-label="上传参考图"><Paperclip aria-hidden="true" /></button>
            </div>
            <button type="button" className="send-button" onClick={() => void generate()} disabled={!prompt.trim() || loading || !canGenerate} aria-label="生成图片"><ArrowUp aria-hidden="true" /></button>
          </div>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    );
  }

  if (status === "checking") return <main className="auth-page"><div className="auth-theme">{themeButton}</div></main>;

  if (status === "locked") {
    return (
      <main className="auth-page">
        <div className="auth-theme">{themeButton}</div>
        <section className="auth-card">
          <div className="brand-lockup">{brandingLogoUrl ? <img src={brandingLogoUrl} alt={branding.logoText || branding.siteName} /> : <span className="brand-wordmark">{branding.logoText || branding.siteName}</span>}</div>
          <h1>访问生图工作台</h1>
          <p>输入部署时设置的访问密码。</p>
          {!config.configured && <p className="config-notice">站点配置尚未完成，请先设置环境变量。</p>}
          <form onSubmit={login}>
            <label htmlFor="password">访问密码</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="输入访问密码" autoFocus />
            {error && <p className="inline-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={loading || !password}>{loading ? "正在验证" : "进入"}</button>
          </form>
        </section>
      </main>
    );
  }

  const hasConversation = messages.length > 0;
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-lockup">{brandingLogoUrl ? <img src={brandingLogoUrl} alt={branding.logoText || branding.siteName} /> : <span className="brand-wordmark">{branding.logoText || branding.siteName}</span>}</div>
          <div className="header-actions"><button type="button" className="header-icon-button" onClick={openHistory} aria-label="本地生成历史" title="本地生成历史"><HistoryIcon aria-hidden="true" /></button><button type="button" className="header-icon-button" onClick={openSettings} aria-label="设置" title="设置"><Settings aria-hidden="true" /></button>{themeButton}<button type="button" className="header-icon-button" onClick={logout} aria-label="退出"><LogOut aria-hidden="true" /></button></div>
        </div>
      </header>

      <div className="generation-page">
        <div ref={results} className="results-area">
          {hasConversation ? (
            <div className="conversation">
              {messages.map((message) => (
                <article key={message.id} className="message-pair">
                  <div className="user-row">
                    <button type="button" className="copy-button" onClick={() => navigator.clipboard.writeText(message.prompt)} aria-label="复制提示词"><Copy aria-hidden="true" /></button>
                    <div className="user-message"><p>{message.prompt}</p>{message.reference && <button type="button" className="message-reference" onClick={() => setPreview({ url: message.reference!.dataUrl, alt: message.reference!.name })}><img src={message.reference.dataUrl} alt={message.reference.name} /></button>}</div>
                  </div>
                  <div className="assistant-row">
                    {message.status === "generating" && <div className="generating-state"><span className="loader-dots" aria-hidden="true" /><span>正在生成 · {elapsed} 秒</span></div>}
                    {message.status === "failed" && <div className="failed-state" role="alert"><strong>生成失败</strong><p>{message.error}</p></div>}
                    {message.status === "completed" && message.imageUrls?.length && <div className="generated-result"><div className={`generated-images count-${message.imageUrls.length}`}>{message.imageUrls.map((imageUrl, imageIndex) => <button key={`${message.id}-${imageIndex}`} type="button" className={`generated-image ${message.aspectRatio}`} onClick={() => setPreview({ url: imageUrl, alt: `${message.prompt} ${imageIndex + 1}` })}><img src={imageUrl} alt={`${message.prompt} ${imageIndex + 1}`} /></button>)}</div><div className="result-actions"><span>{[message.modelLabel, message.sizeLabel, message.quality, `${message.imageUrls.length} 张`].filter(Boolean).join(" · ")}</span>{message.imageUrls.map((imageUrl, imageIndex) => <a key={`${message.id}-download-${imageIndex}`} href={imageUrl} download={`gloopix-image-${imageIndex + 1}.png`}><Download aria-hidden="true" />下载{message.imageUrls!.length > 1 ? ` ${imageIndex + 1}` : "图片"}</a>)}</div></div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-home">
              <h1>{branding.siteName}</h1>
              {branding.siteDescription && <p>{branding.siteDescription}</p>}
              {!config.configured && !localConfigured && <p className="config-notice">图片 API 尚未配置，请使用右上角设置完成 API 与模型配置。</p>}
              {renderComposer()}
              <small>部署本身可以免费，模型 API 调用可能收费。</small>
            </div>
          )}
        </div>
        {hasConversation && <div className="bottom-composer">{renderComposer()}</div>}
      </div>

      {historyOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHistory(); }}>
          <section className="settings-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <div className="settings-heading"><div><h2 id="history-title">本地生成历史</h2><p>仅保存在当前浏览器与当前网站域名。</p></div><button type="button" className="header-icon-button" onClick={closeHistory} aria-label="关闭历史"><X aria-hidden="true" /></button></div>
            <div className="history-body">
              {historyStats && <div className="storage-card"><HardDrive aria-hidden="true" /><div><div className="storage-line"><strong>{formatStorageBytes(historyStats.bytes)}</strong><span>上限 {formatStorageBytes(historyStats.limit)}</span></div><div className="storage-meter" aria-label={`已使用 ${formatStorageBytes(historyStats.bytes)}`}><span style={{ width: `${Math.min(100, historyStats.limit ? historyStats.bytes / historyStats.limit * 100 : 0)}%` }} /></div><p>{historyStats.count} 次生成 · {historyStats.imageCount} 张图片 · {historyStats.persistent ? "已获持久化存储" : "浏览器可能在空间紧张时回收"}</p></div></div>}
              {historyNotice && <p className="history-notice">{historyNotice}</p>}
              {historyError && <p className="inline-error" role="alert">{historyError}</p>}
              {historyLoading ? <p className="history-empty">正在读取本地历史…</p> : historyRecords.length ? <div className="history-list">{historyRecords.map((record) => <article className="history-card" key={record.id}><div className="history-card-heading"><time dateTime={new Date(record.createdAt).toISOString()}>{new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false })}</time><button type="button" onClick={() => void removeHistoryRecord(record.id)} aria-label={`删除历史 ${record.prompt}`}><Trash2 aria-hidden="true" /></button></div><p className="history-prompt">{record.prompt}</p><p className="history-meta">{[record.modelLabel, record.sizeLabel || record.resolution?.toUpperCase(), record.quality, `${record.images.length} 张`, formatStorageBytes(record.bytes)].filter(Boolean).join(" · ")}</p><div className={`history-images count-${record.imageUrls.length}`}>{record.imageUrls.map((imageUrl, index) => <div className="history-image" key={`${record.id}-${index}`}><button type="button" onClick={() => setPreview({ url: imageUrl, alt: `${record.prompt} ${index + 1}` })}><img src={imageUrl} alt={`${record.prompt} ${index + 1}`} /></button><a href={imageUrl} download={`gloopix-history-${record.id}-${index + 1}.png`}><Download aria-hidden="true" />下载</a></div>)}</div></article>)}</div> : <div className="history-empty"><HistoryIcon aria-hidden="true" /><strong>还没有本地历史</strong><p>新生成的图片会自动保存到这里，刷新页面后仍可查看。</p></div>}
            </div>
            <div className="settings-footer history-footer"><span>超过本地上限时自动清理最早记录</span><button type="button" className="danger-button" onClick={() => void removeAllHistory()} disabled={!historyRecords.length}>清空全部</button></div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-heading"><div><h2 id="settings-title">设置</h2><p>基础信息与图片接口保存在当前浏览器；访问密码保存在服务端。</p></div><button type="button" className="header-icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X aria-hidden="true" /></button></div>
            <nav className="settings-tabs" aria-label="设置分类"><button type="button" className={settingsSection === "branding" ? "active" : ""} onClick={() => setSettingsSection("branding")}>基础信息</button><button type="button" className={settingsSection === "api" ? "active" : ""} onClick={() => setSettingsSection("api")}>API 与模型</button><button type="button" className={settingsSection === "security" ? "active" : ""} onClick={() => setSettingsSection("security")}>访问密码</button></nav>
            {settingsSection === "branding" ? <form onSubmit={(event) => void saveBrandingSettings(event)}>
              <div className="settings-scroll branding-settings">
                <div className="settings-section-intro"><h3>品牌信息</h3><p>用于当前浏览器中的工作台名称、说明与图标。</p></div>
                <div className="settings-grid">
                  <div className="settings-field"><label htmlFor="branding-site-name">网站名称</label><input id="branding-site-name" value={draftBranding.siteName} onChange={(event) => setDraftBranding((current) => renameBrandingSite(current, event.target.value))} placeholder="输入网站名称" maxLength={40} autoFocus /><small>默认同步到左上角 Logo 文字和浏览器标题。</small></div>
                  <div className="settings-field"><label htmlFor="branding-browser-title">浏览器标题</label><input id="branding-browser-title" value={draftBranding.browserTitle} onChange={(event) => setDraftBranding((current) => ({ ...current, browserTitle: event.target.value, browserTitleCustomized: true }))} placeholder="输入浏览器标签页标题" maxLength={60} /></div>
                  <div className="settings-field"><label htmlFor="branding-description">网站简介</label><input id="branding-description" value={draftBranding.siteDescription} onChange={(event) => setDraftBranding((current) => ({ ...current, siteDescription: event.target.value }))} placeholder="显示在首页主标题下方" maxLength={120} /><small>显示在首页主标题下方。</small></div>
                  <div className="settings-field"><label htmlFor="branding-logo-text">Logo 文字（左上角）</label><input id="branding-logo-text" value={draftBranding.logoText} onChange={(event) => setDraftBranding((current) => ({ ...current, logoText: event.target.value, logoTextCustomized: true }))} placeholder="未选择 Logo 图片时显示" maxLength={30} /><small>未选择 Logo 图片时显示；单独修改后不再跟随网站名称。</small></div>
                </div>
                <div className="branding-assets">
                  <section className="branding-asset-card">
                    <div><h3>Logo 图片</h3><p>PNG、JPG 或 WebP，不超过 2MB；建议透明背景、宽高比 4:1。</p></div>
                    <div className="branding-asset-picker"><div className="branding-asset-preview logo-preview">{draftLogoUrl ? <img src={draftLogoUrl} alt="Logo 预览" /> : <span>暂无图片</span>}</div><div className="branding-asset-actions"><input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { selectBrandingAsset("logo", event.target.files?.[0]); event.target.value = ""; }} /><button type="button" className="secondary-button" onClick={() => logoInput.current?.click()}><ImageUp aria-hidden="true" />选择图片</button>{draftBranding.logoImage && <button type="button" className="text-button" onClick={() => setDraftBranding((current) => ({ ...current, logoImage: undefined }))}>移除</button>}</div></div>
                  </section>
                  <section className="branding-asset-card">
                    <div><h3>标签页图标</h3><p>PNG、JPG、WebP 或 ICO，不超过 2MB；建议使用正方形图片。</p></div>
                    <div className="branding-asset-picker"><div className="branding-asset-preview favicon-preview">{draftFaviconUrl ? <img src={draftFaviconUrl} alt="标签页图标预览" /> : <span>暂无图片</span>}</div><div className="branding-asset-actions"><input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,.ico" hidden onChange={(event) => { selectBrandingAsset("favicon", event.target.files?.[0]); event.target.value = ""; }} /><button type="button" className="secondary-button" onClick={() => faviconInput.current?.click()}><ImageUp aria-hidden="true" />选择图片</button>{draftBranding.favicon && <button type="button" className="text-button" onClick={() => setDraftBranding((current) => ({ ...current, favicon: undefined }))}>移除</button>}</div></div>
                  </section>
                </div>
                {brandingError && <p className="inline-error" role="alert">{brandingError}</p>}
              </div>
              <div className="settings-footer"><button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>取消</button><button type="submit" className="settings-save">保存设置</button></div>
            </form> : settingsSection === "security" ? <form onSubmit={(event) => void saveAccessPassword(event)}>
              <div className="settings-scroll security-settings">
                <div className="settings-section-intro"><h3>修改访问密码</h3><p>修改后，旧密码和其他设备的登录状态将失效。请记住新密码。</p></div>
                <div className="security-fields">
                  <div className="settings-field"><label htmlFor="current-access-password">当前密码</label><input id="current-access-password" type="password" value={currentAccessPassword} onChange={(event) => setCurrentAccessPassword(event.target.value)} autoComplete="current-password" required autoFocus /></div>
                  <div className="settings-field"><label htmlFor="new-access-password">新密码</label><input id="new-access-password" type="password" value={newAccessPassword} onChange={(event) => setNewAccessPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={128} required /><small>至少 6 个字符；公开部署建议使用更强的密码。</small></div>
                  <div className="settings-field"><label htmlFor="confirm-access-password">确认新密码</label><input id="confirm-access-password" type="password" value={confirmAccessPassword} onChange={(event) => setConfirmAccessPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={128} required /></div>
                </div>
                {passwordChangeError && <p className="inline-error" role="alert">{passwordChangeError}</p>}
                {passwordChangeSuccess && <p role="status">{passwordChangeSuccess}</p>}
              </div>
              <div className="settings-footer"><button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>取消</button><button type="submit" className="settings-save" disabled={passwordChanging}>{passwordChanging ? "正在修改" : "修改密码"}</button></div>
            </form> : <form onSubmit={saveSettings}>
              <div className="settings-scroll">
                <div className="api-list-heading"><div><h3>API</h3><p>每个 API 可以配置独立地址、密钥和模型。</p></div><button type="button" className="secondary-button" onClick={() => setDraftSettings((current) => ({ providers: [...current.providers, newProvider(current.providers.length + 1)] }))}><Plus aria-hidden="true" />添加 API</button></div>
                <div className="api-list">
                  {draftSettings.providers.map((provider, providerIndex) => (
                    <section className="api-card" key={provider.key}>
                      <div className="api-card-heading">
                        <div className="settings-field"><label htmlFor={`api-name-${provider.key}`}>API 名称</label><input id={`api-name-${provider.key}`} value={provider.name} onChange={(event) => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, name: event.target.value } : item) }))} placeholder={`API ${providerIndex + 1}`} autoFocus={providerIndex === 0} /></div>
                        <button type="button" className="delete-api" onClick={() => setDraftSettings((current) => ({ providers: current.providers.filter((item) => item.key !== provider.key) }))} aria-label={`删除 API ${provider.name || providerIndex + 1}`}><Trash2 aria-hidden="true" />删除 API</button>
                      </div>
                      <div className="settings-field"><label htmlFor={`api-protocol-${provider.key}`}>接口类型</label><select id={`api-protocol-${provider.key}`} value={provider.protocol} onChange={(event) => { const protocol = event.target.value as ApiProviderSetting["protocol"]; setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, protocol, apiBaseUrl: protocol === "apimart" && item.apiBaseUrl === "https://api.openai.com/v1" ? "https://api.apimart.ai/v1" : item.apiBaseUrl, models: item.models.map((model) => ({ ...model, sizeOptions: modelSizeTemplate(model.id, protocol), defaultSizeKey: "auto", supportedResolutions: protocol === "apimart" && model.id === "gpt-image-2" ? ["1k", "2k", "4k"] : model.supportedResolutions })) } : item) })); }}><option value="openai">OpenAI Images 兼容</option><option value="apimart">APIMart 异步生图</option></select></div>
                      <div className="settings-field"><label htmlFor={`api-base-url-${provider.key}`}>API 地址</label><input id={`api-base-url-${provider.key}`} value={provider.apiBaseUrl} onChange={(event) => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, apiBaseUrl: event.target.value } : item) }))} placeholder="https://api.openai.com/v1" /></div>
                      <div className="settings-field"><label htmlFor={`api-key-${provider.key}`}>API Key</label><div className="secret-input"><input id={`api-key-${provider.key}`} type={visibleApiKeys[provider.key] ? "text" : "password"} value={provider.apiKey} onChange={(event) => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, apiKey: event.target.value } : item) }))} placeholder="sk-..." autoComplete="off" /><button type="button" onClick={() => setVisibleApiKeys((current) => ({ ...current, [provider.key]: !current[provider.key] }))} aria-label={visibleApiKeys[provider.key] ? "隐藏 API Key" : "显示 API Key"}>{visibleApiKeys[provider.key] ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>{providerIndex === 0 && <small>仅保存在当前浏览器，生成时发送给你部署的站点服务端。</small>}</div>
                      <details className="advanced-settings"><summary>接口路径</summary><div className="settings-grid"><div className="settings-field"><label htmlFor={`generations-path-${provider.key}`}>文生图</label><input id={`generations-path-${provider.key}`} value={provider.generationsPath} onChange={(event) => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, generationsPath: event.target.value } : item) }))} /></div>{provider.protocol === "openai" && <div className="settings-field"><label htmlFor={`edits-path-${provider.key}`}>参考图生图</label><input id={`edits-path-${provider.key}`} value={provider.editsPath} onChange={(event) => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, editsPath: event.target.value } : item) }))} /></div>}</div></details>
                      <div className="models-heading"><div><h3>模型</h3><p>模型 ID 会原样发送给此 API。</p></div><button type="button" className="secondary-button" onClick={() => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, models: [...item.models, newModel("", "", item.protocol)] } : item) }))}><Plus aria-hidden="true" />添加模型</button></div>
                      <div className="model-list">{provider.models.map((model, modelIndex) => (
                        <section className="model-card" key={model.key}>
                          <div className="model-row"><div className="settings-field"><label htmlFor={`model-name-${model.key}`}>显示名称</label><input id={`model-name-${model.key}`} value={model.name} onChange={(event) => patchDraftModel(provider.key, model.key, { name: event.target.value })} placeholder="输入显示名称（如 GPT Image 2）" /></div><div className="settings-field"><label htmlFor={`model-id-${model.key}`}>模型 ID</label><input id={`model-id-${model.key}`} value={model.id} onChange={(event) => patchDraftModel(provider.key, model.key, { id: event.target.value })} onBlur={(event) => { const template = modelSizeTemplate(event.target.value, provider.protocol); if (model.sizeOptions.length === 1 && template.length > 1) patchDraftModel(provider.key, model.key, { sizeOptions: template, defaultSizeKey: "auto" }); }} placeholder="输入模型 ID（如 gpt-image-2）" /></div><button type="button" className="delete-model" onClick={() => setDraftSettings((current) => ({ providers: current.providers.map((item) => item.key === provider.key ? { ...item, models: item.models.filter((entry) => entry.key !== model.key) } : item) }))} aria-label={`删除模型 ${model.name || modelIndex + 1}`}><Trash2 aria-hidden="true" /></button></div>
                          <div className="model-capabilities">
                            <label><input type="checkbox" checked={model.supportsQuality} onChange={(event) => patchDraftModel(provider.key, model.key, { supportsQuality: event.target.checked })} />质量档位</label>
                            <label><input type="checkbox" checked={model.supportsResolution} onChange={(event) => patchDraftModel(provider.key, model.key, { supportsResolution: event.target.checked })} />尺寸参数</label>
                          </div>
                          {(model.supportsQuality || model.supportsResolution) && <div className="capability-settings">
                            {model.supportsQuality && <div className="settings-field"><label htmlFor={`default-quality-${model.key}`}>默认质量</label><select id={`default-quality-${model.key}`} value={model.defaultQuality} onChange={(event) => patchDraftModel(provider.key, model.key, { defaultQuality: event.target.value as ImageQuality })}>{qualityOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>}
                            {provider.protocol === "apimart" && model.supportsResolution && <div className="settings-field"><label htmlFor={`default-resolution-${model.key}`}>默认分辨率</label><select id={`default-resolution-${model.key}`} value={model.defaultResolution} onChange={(event) => patchDraftModel(provider.key, model.key, { defaultResolution: event.target.value as ImageResolution })}>{model.supportedResolutions.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select><small>APIMart 的尺寸比例与输出分辨率分别设置。</small></div>}
                            {provider.protocol === "apimart" && model.supportsResolution && <fieldset className="resolution-options"><legend>可选分辨率</legend>{(["1k", "2k", "4k"] as ImageResolution[]).map((value) => <label key={value}><input type="checkbox" checked={model.supportedResolutions.includes(value)} onChange={(event) => { const values = event.target.checked ? (["1k", "2k", "4k"] as ImageResolution[]).filter((item) => item === value || model.supportedResolutions.includes(item)) : model.supportedResolutions.filter((item) => item !== value); if (values.length) patchDraftModel(provider.key, model.key, { supportedResolutions: values, defaultResolution: values.includes(model.defaultResolution) ? model.defaultResolution : values[0] }); }} />{value.toUpperCase()}</label>)}</fieldset>}
                            {model.supportsResolution && <div className="model-size-settings"><div className="settings-field"><label htmlFor={`default-size-${model.key}`}>默认尺寸</label><select id={`default-size-${model.key}`} value={model.sizeOptions.some((option) => option.key === model.defaultSizeKey) ? model.defaultSizeKey : "auto"} onChange={(event) => patchDraftModel(provider.key, model.key, { defaultSizeKey: event.target.value })}>{model.sizeOptions.map((option) => <option key={option.key} value={option.key}>{option.label || option.value || "未命名尺寸"}</option>)}</select><small>不知道模型能力时保持“自动”，生成请求不会主动发送尺寸参数。</small></div><div className="size-settings-heading"><div><strong>自定义尺寸</strong><span>仅在服务商文档明确支持时填写。</span></div><button type="button" className="secondary-button" onClick={() => patchDraftModel(provider.key, model.key, { sizeOptions: modelSizeTemplate(model.id, provider.protocol), defaultSizeKey: "auto" })}>应用内置模板</button></div><div className="size-option-list">{model.sizeOptions.filter((option) => option.value !== "auto").map((option) => <div className="size-option-row" key={option.key}><input value={option.label} onChange={(event) => patchDraftSize(provider.key, model.key, option.key, { label: event.target.value })} placeholder="显示名称，如 16:9 · 2K" aria-label="尺寸显示名称" /><input value={option.value} onChange={(event) => patchDraftSize(provider.key, model.key, option.key, { value: event.target.value })} placeholder="API 参数，如 2048x1152" aria-label="尺寸 API 参数" /><select value={option.shape} onChange={(event) => patchDraftSize(provider.key, model.key, option.key, { shape: event.target.value as AspectRatio })} aria-label="图片方向"><option value="auto">自动</option><option value="square">方形</option><option value="landscape">横图</option><option value="portrait">竖图</option></select><button type="button" onClick={() => patchDraftModel(provider.key, model.key, { sizeOptions: model.sizeOptions.filter((entry) => entry.key !== option.key), defaultSizeKey: model.defaultSizeKey === option.key ? "auto" : model.defaultSizeKey })} aria-label={`删除尺寸 ${option.label || option.value}`}><Trash2 aria-hidden="true" /></button></div>)}</div><button type="button" className="secondary-button add-size-button" onClick={() => patchDraftModel(provider.key, model.key, { sizeOptions: [...model.sizeOptions, { key: crypto.randomUUID(), label: "", value: "", shape: "auto" }] })}><Plus aria-hidden="true" />添加自定义尺寸</button></div>}
                          </div>}
                        </section>
                      ))}</div>
                    </section>
                  ))}
                </div>
                {settingsError && <p className="inline-error" role="alert">{settingsError}</p>}
              </div>
              <div className="settings-footer"><button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>取消</button><button type="submit" className="settings-save">保存设置</button></div>
            </form>}
          </section>
        </div>
      )}

      {preview && <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreview(undefined)}><button type="button" className="preview-close" onClick={() => setPreview(undefined)} aria-label="关闭图片预览"><X aria-hidden="true" /></button><img src={preview.url} alt={preview.alt} onClick={(event) => event.stopPropagation()} /><a href={preview.url} download="gloopix-image.png" onClick={(event) => event.stopPropagation()}><Download aria-hidden="true" />下载图片</a></div>}
    </main>
  );
}
