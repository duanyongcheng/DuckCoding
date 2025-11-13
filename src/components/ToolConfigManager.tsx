import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getClaudeSchema,
  getClaudeSettings,
  getCodexSchema,
  getCodexSettings,
  getGeminiSchema,
  getGeminiSettings,
  saveClaudeSettings,
  saveCodexSettings,
  saveGeminiSettings,
  type CodexSettingsPayload,
  type GeminiSettingsPayload,
  type GeminiEnvConfig,
  type JsonObject,
  type JsonSchema,
  type JsonValue,
} from '@/lib/tauri-commands';
import { useToast } from '@/hooks/use-toast';
import { GripVertical, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { SecretInput } from '@/components/SecretInput';
import { cn } from '@/lib/utils';

type JSONSchema = JsonSchema & {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  enum?: (string | number)[];
  const?: unknown;
  $ref?: string;
  additionalProperties?: boolean | JSONSchema;
  default?: unknown;
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  patternProperties?: Record<string, JSONSchema>;
  examples?: unknown[];
  required?: string[];
  $defs?: Record<string, JSONSchema>;
  'x-secret'?: boolean;
};

interface SchemaOption {
  key: string;
  description: string;
  schema?: JSONSchema;
  typeLabel: string;
}

interface SchemaFieldProps {
  schema?: JSONSchema;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  onDelete?: () => void;
  path: (string | number)[];
  rootSchema: JSONSchema | null;
  isRequired?: boolean;
  showDescription?: boolean;
  inline?: boolean;
  rootValue: JsonObject;
}

interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before?: JsonValue;
  after?: JsonValue;
}

export interface ToolConfigManagerProps {
  title: string;
  description: string;
  loadSchema: () => Promise<JsonSchema>;
  loadSettings: () => Promise<JsonObject>;
  saveSettings: (settings: JsonObject) => Promise<void>;
  emptyHint?: string;
  refreshSignal?: number;
  externalDirty?: boolean;
  onResetExternalChanges?: () => void;
  computeExternalDiffs?: () => DiffEntry[];
}

const DEFAULT_DESCRIPTION = '未提供描述';

type CustomFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

const CUSTOM_FIELD_TYPE_OPTIONS: { label: string; value: CustomFieldType }[] = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
];

const GEMINI_ENV_DEFAULT: GeminiEnvConfig = {
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-pro',
};

const cloneGeminiEnv = (env?: GeminiEnvConfig): GeminiEnvConfig => ({
  apiKey: env?.apiKey ?? '',
  baseUrl: env?.baseUrl ?? '',
  model: env?.model ?? 'gemini-2.5-pro',
});

export function ToolConfigManager({
  title,
  description,
  loadSchema,
  loadSettings,
  saveSettings,
  emptyHint = '当前配置文件为空，点击「新增配置选项」开始添加。',
  refreshSignal,
  externalDirty = false,
  onResetExternalChanges,
  computeExternalDiffs,
}: ToolConfigManagerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaRoot, setSchemaRoot] = useState<JSONSchema | null>(null);
  const [originalSettings, setOriginalSettings] = useState<JsonObject>({});
  const [draftSettings, setDraftSettings] = useState<JsonObject>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customFieldType, setCustomFieldType] = useState<CustomFieldType>('string');

  const schemaOptions = useMemo<SchemaOption[]>(() => {
    if (!schemaRoot || !schemaRoot.properties) {
      return [];
    }

    return Object.entries(schemaRoot.properties).map(([key, schema]) => {
      const resolved = resolveSchema(schema, schemaRoot);
      return {
        key,
        schema: resolved,
        description: resolved?.description ?? DEFAULT_DESCRIPTION,
        typeLabel: getTypeLabel(resolved),
      };
    });
  }, [schemaRoot]);

  const filteredOptions = useMemo(() => {
    if (!searchKeyword.trim()) {
      return schemaOptions;
    }
    const keyword = searchKeyword.toLowerCase();
    return schemaOptions.filter(
      (option) =>
        option.key.toLowerCase().includes(keyword) ||
        option.description.toLowerCase().includes(keyword),
    );
  }, [schemaOptions, searchKeyword]);

  const hasChanges = useMemo(() => {
    if (externalDirty) {
      return true;
    }
    return JSON.stringify(originalSettings) !== JSON.stringify(draftSettings);
  }, [originalSettings, draftSettings, externalDirty]);

  const loadData = useCallback(
    async (options?: { refetchSchema?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const shouldFetchSchema = options?.refetchSchema || !schemaRoot;
        const schemaPromise = shouldFetchSchema
          ? loadSchema().then((schema) => schema as JSONSchema)
          : Promise.resolve(schemaRoot as JSONSchema);

        const [settings, resolvedSchema] = await Promise.all([loadSettings(), schemaPromise]);

        if (shouldFetchSchema || !schemaRoot) {
          setSchemaRoot(resolvedSchema);
        }

        const cloned = cloneJsonObject(settings);
        setOriginalSettings(cloned);
        setDraftSettings(cloned);
        setHasLoaded(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [schemaRoot, loadSchema, loadSettings],
  );

  useEffect(() => {
    if (!hasLoaded) {
      void loadData();
    }
  }, [hasLoaded, loadData]);

  useEffect(() => {
    if (refreshSignal !== undefined && hasLoaded) {
      void loadData();
    }
  }, [refreshSignal, hasLoaded, loadData]);

  interface AddKeyOptions {
    schema?: JSONSchema;
    fieldType?: CustomFieldType;
  }

  const handleAddKey = (key: string, options?: AddKeyOptions) => {
    if (!key.trim()) {
      return;
    }

    if (draftSettings[key] !== undefined) {
      toast({
        title: '配置选项已存在',
        description: `配置选项 ${key} 已存在，无法重复添加。`,
      });
      return;
    }

    const next = cloneJsonObject(draftSettings);
    const schemaForDefault = options?.schema ?? createSchemaForType(options?.fieldType);
    next[key] = getDefaultValue(schemaForDefault);
    setDraftSettings(next);
    setAddDialogOpen(false);
    setSearchKeyword('');
    setCustomKey('');
    if (options?.fieldType) {
      setCustomFieldType('string');
    }
  };

  const handleDeleteKey = (key: string) => {
    const next = cloneJsonObject(draftSettings);
    delete next[key];
    setDraftSettings(next);
  };

  const handleReload = () => {
    void loadData({ refetchSchema: true });
  };

  const handleResetDraft = () => {
    setDraftSettings(cloneJsonObject(originalSettings));
    onResetExternalChanges?.();
  };

  const computeDiffs = useCallback((): DiffEntry[] => {
    const diffs: DiffEntry[] = [];
    buildDiffEntries([], originalSettings, draftSettings, diffs);
    return diffs;
  }, [originalSettings, draftSettings]);

  const handleSaveClick = () => {
    const diffs = computeDiffs();
    const externalDiffs = computeExternalDiffs?.() ?? [];
    const combinedDiffs = [...diffs, ...externalDiffs];
    if (combinedDiffs.length === 0 && !externalDirty) {
      toast({
        title: '没有需要保存的修改',
        description: '请先更改配置后再尝试保存。',
      });
      return;
    }
    setDiffEntries(combinedDiffs);
    setDiffDialogOpen(true);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      await saveSettings(cloneJsonObject(draftSettings));
      setOriginalSettings(cloneJsonObject(draftSettings));
      setDiffDialogOpen(false);
      toast({
        title: '保存成功',
        description: '配置已写入目标文件。',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: '保存失败',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const topLevelKeys = useMemo(() => {
    return Object.keys(draftSettings).sort((a, b) => a.localeCompare(b));
  }, [draftSettings]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm">配置加载中...</p>
          <p className="text-xs text-muted-foreground">切换或刷新配置时请稍候</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          读取配置失败：{error}
        </div>
      );
    }

    if (topLevelKeys.length === 0) {
      return (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {topLevelKeys.map((key) => {
          const schemaInfo = schemaOptions.find((option) => option.key === key);
          const description = schemaInfo?.description ?? DEFAULT_DESCRIPTION;
          const schema = schemaInfo?.schema;
          const currentValue = draftSettings[key];
          const fieldType = getEffectiveType(schema, currentValue);
          const typeLabel = schemaInfo?.typeLabel ?? fieldType ?? 'string';
          const isCompound = isCompoundField(schema, currentValue);

          return (
            <Card key={key} className="border border-slate-200/80">
              {isCompound ? (
                <>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold font-mono">{key}</CardTitle>
                      <Badge variant="outline">{typeLabel}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKey(key)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <SchemaField
                      schema={schema}
                      value={draftSettings[key]}
                      onChange={(value) => {
                        const next = cloneJsonObject(draftSettings);
                        next[key] = value;
                        setDraftSettings(next);
                      }}
                      path={[key]}
                      rootSchema={schemaRoot}
                      rootValue={draftSettings}
                    />
                  </CardContent>
                </>
              ) : (
                <CardHeader className="space-y-2">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex items-center gap-2 md:basis-1/2">
                      <CardTitle className="text-base font-semibold font-mono">{key}</CardTitle>
                      <Badge variant="outline">{typeLabel}</Badge>
                    </div>
                    <div className="flex items-center gap-3 md:basis-1/2">
                      <div
                        className={
                          fieldType === 'boolean'
                            ? 'flex-1 min-w-0 flex justify-end'
                            : 'flex-1 min-w-0'
                        }
                      >
                        <SchemaField
                          inline
                          schema={schema}
                          value={draftSettings[key]}
                          onChange={(value) => {
                            const next = cloneJsonObject(draftSettings);
                            next[key] = value;
                            setDraftSettings(next);
                          }}
                          path={[key]}
                          rootSchema={schemaRoot}
                          showDescription={false}
                          rootValue={draftSettings}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteKey(key)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </CardHeader>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="border border-slate-200/80 shadow-lg">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleReload} disabled={loading}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              disabled={loading}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              新增配置选项
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetDraft} disabled={!hasChanges}>
              撤销修改
            </Button>
            <Button size="sm" onClick={handleSaveClick} disabled={!hasChanges}>
              <Save className="mr-1.5 h-4 w-4" />
              保存
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          每个配置选项下方都会展示 JSON Schema 提供的描述信息，若显示「未提供描述」表示该子选项未在
          schema 中定义或为自定义子选项。
        </div>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增配置选项</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-search">搜索 JSON Schema 配置选项</Label>
              <Input
                id="config-search"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="输入关键字，例如 model..."
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {filteredOptions.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">没有匹配的配置选项</div>
              )}
              {filteredOptions.map((option) => {
                const alreadyExists = draftSettings[option.key] !== undefined;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      if (!alreadyExists) {
                        handleAddKey(option.key, { schema: option.schema });
                      }
                    }}
                    disabled={alreadyExists}
                    className={`flex w-full flex-col items-start gap-1 border-b p-3 text-left ${
                      alreadyExists
                        ? 'cursor-not-allowed bg-muted/30 text-muted-foreground'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                      {option.key}
                      {alreadyExists && (
                        <Badge variant="secondary" className="text-[10px]">
                          已存在
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-key">或直接输入自定义 key</Label>
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <Input
                  id="custom-key"
                  className="flex-1"
                  value={customKey}
                  onChange={(event) => setCustomKey(event.target.value)}
                  placeholder="例如 customFlag"
                />
                <Select
                  value={customFieldType}
                  onValueChange={(value) => setCustomFieldType(value as CustomFieldType)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAddKey(customKey, { fieldType: customFieldType })}
                  disabled={!customKey.trim()}
                >
                  添加
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                自定义配置选项将被标记为“未提供描述”。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>保存前差异确认</DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] space-y-3 overflow-y-auto">
            {diffEntries.length === 0 && (
              <div className="rounded-md border border-slate-200 p-4 text-sm text-muted-foreground">
                没有检测到差异
              </div>
            )}
            {diffEntries.map((diff) => (
              <div
                key={diff.path + diff.type}
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="font-mono text-sm">{diff.path}</span>
                  <Badge variant={diff.type === 'changed' ? 'default' : 'secondary'}>
                    {diff.type}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">之前</p>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-white p-2">
                      {formatJson(diff.before)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">之后</p>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-white p-2">
                      {formatJson(diff.after)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDiffDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleConfirmSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '确认保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ClaudeConfigManager({ refreshSignal }: { refreshSignal?: number }) {
  return (
    <ToolConfigManager
      title="Claude Code 配置管理"
      description="读取并编辑 settings.json"
      loadSchema={getClaudeSchema}
      loadSettings={getClaudeSettings}
      saveSettings={saveClaudeSettings}
      refreshSignal={refreshSignal}
    />
  );
}

export function CodexConfigManager({ refreshSignal }: { refreshSignal?: number }) {
  const [authToken, setAuthToken] = useState('');
  const [originalAuthToken, setOriginalAuthToken] = useState('');
  const [authDirty, setAuthDirty] = useState(false);

  const loadSettings = useCallback(async () => {
    const payload: CodexSettingsPayload = await getCodexSettings();
    const token = payload.authToken ?? '';
    setAuthToken(token);
    setOriginalAuthToken(token);
    setAuthDirty(false);
    return payload.config;
  }, []);

  const saveConfig = useCallback(
    async (settings: JsonObject) => {
      await saveCodexSettings(settings, authToken);
      setOriginalAuthToken(authToken);
      setAuthDirty(false);
    },
    [authToken],
  );

  const computeAuthDiffs = useCallback((): DiffEntry[] => {
    if (authToken === originalAuthToken) {
      return [];
    }
    const beforeValue = originalAuthToken ?? '';
    const afterValue = authToken ?? '';

    let type: DiffEntry['type'] = 'changed';
    if (!beforeValue && afterValue) {
      type = 'added';
    } else if (beforeValue && !afterValue) {
      type = 'removed';
    }

    return [
      {
        path: 'auth.OPENAI_API_KEY',
        type,
        before: beforeValue || undefined,
        after: afterValue || undefined,
      },
    ];
  }, [authToken, originalAuthToken]);

  const handleResetAuthToken = useCallback(() => {
    setAuthToken(originalAuthToken);
    setAuthDirty(false);
  }, [originalAuthToken]);

  return (
    <div className="space-y-4">
      <ToolConfigManager
        title="Codex 配置管理"
        description="读取并编辑 config.toml"
        loadSchema={getCodexSchema}
        loadSettings={loadSettings}
        saveSettings={saveConfig}
        emptyHint="当前 config.toml 为空，点击「新增配置选项」开始添加。"
        refreshSignal={refreshSignal}
        externalDirty={authDirty}
        onResetExternalChanges={handleResetAuthToken}
        computeExternalDiffs={computeAuthDiffs}
      />

      <Card className="border border-slate-200/80">
        <CardHeader>
          <CardTitle>Codex API Key</CardTitle>
          <CardDescription>读取并编辑 auth.json，用于 Codex CLI 请求。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 md:basis-1/2">
              <Label htmlFor="codex-api-key" className="font-mono text-sm font-semibold">
                OPENAI_API_KEY
              </Label>
              <Badge variant="outline">string</Badge>
            </div>
            <div className="flex-1 min-w-0">
              <SecretInput
                id="codex-api-key"
                value={authToken}
                onValueChange={(val) => {
                  setAuthToken(val);
                  setAuthDirty(true);
                }}
                placeholder="sk-..."
                toggleLabel="切换 Codex API Key 可见性"
                className="w-full"
                wrapperClassName="w-full"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            修改后点击上方“保存”将同时写入 config.toml 与 auth.json。
          </p>
          {authDirty && <p className="text-xs text-amber-600">API Key 已更新，记得保存以生效。</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export function GeminiConfigManager({ refreshSignal }: { refreshSignal?: number }) {
  const [envState, setEnvState] = useState<GeminiEnvConfig>(() =>
    cloneGeminiEnv(GEMINI_ENV_DEFAULT),
  );
  const [originalEnv, setOriginalEnv] = useState<GeminiEnvConfig>(() =>
    cloneGeminiEnv(GEMINI_ENV_DEFAULT),
  );
  const [envDirty, setEnvDirty] = useState(false);

  const loadSettings = useCallback(async () => {
    const payload: GeminiSettingsPayload = await getGeminiSettings();
    const nextEnv = cloneGeminiEnv(payload.env);
    setEnvState(nextEnv);
    setOriginalEnv(nextEnv);
    setEnvDirty(false);
    return payload.settings;
  }, []);

  const saveConfig = useCallback(
    async (settings: JsonObject) => {
      await saveGeminiSettings(settings, envState);
      setOriginalEnv(cloneGeminiEnv(envState));
      setEnvDirty(false);
    },
    [envState],
  );

  const handleResetEnv = useCallback(() => {
    setEnvState(cloneGeminiEnv(originalEnv));
    setEnvDirty(false);
  }, [originalEnv]);

  const updateEnvField = useCallback((field: keyof GeminiEnvConfig, value: string) => {
    setEnvState((prev) => ({ ...prev, [field]: value }));
    setEnvDirty(true);
  }, []);

  const computeEnvDiffs = useCallback((): DiffEntry[] => {
    const diffs: DiffEntry[] = [];
    (['apiKey', 'baseUrl', 'model'] as const).forEach((field) => {
      if (envState[field] === originalEnv[field]) {
        return;
      }

      const beforeValue = originalEnv[field];
      const afterValue = envState[field];
      let type: DiffEntry['type'] = 'changed';
      if (!beforeValue && afterValue) {
        type = 'added';
      } else if (beforeValue && !afterValue) {
        type = 'removed';
      }

      const path = `env.${
        field === 'apiKey'
          ? 'GEMINI_API_KEY'
          : field === 'baseUrl'
            ? 'GOOGLE_GEMINI_BASE_URL'
            : 'GEMINI_MODEL'
      }`;

      diffs.push({
        path,
        type,
        before: beforeValue || undefined,
        after: afterValue || undefined,
      });
    });
    return diffs;
  }, [envState, originalEnv]);

  return (
    <div className="space-y-4">
      <ToolConfigManager
        title="Gemini 配置管理"
        description="读取并编辑 settings.json"
        loadSchema={getGeminiSchema}
        loadSettings={loadSettings}
        saveSettings={saveConfig}
        emptyHint="当前 settings.json 为空，点击「新增配置选项」开始添加。"
        refreshSignal={refreshSignal}
        externalDirty={envDirty}
        onResetExternalChanges={handleResetEnv}
        computeExternalDiffs={computeEnvDiffs}
      />

      <Card className="border border-slate-200/80">
        <CardHeader>
          <CardTitle>Gemini .env</CardTitle>
          <CardDescription>读取并编辑 .env，管理 Base URL、API Key 与默认模型。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 md:basis-1/3">
              <Label htmlFor="gemini-api-key" className="font-mono text-sm font-semibold">
                GEMINI_API_KEY
              </Label>
              <Badge variant="outline">string</Badge>
            </div>
            <SecretInput
              id="gemini-api-key"
              value={envState.apiKey}
              onValueChange={(val) => updateEnvField('apiKey', val)}
              placeholder="ya29...."
              className="w-full"
              wrapperClassName="w-full"
              toggleLabel="切换 Gemini API Key 可见性"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 md:basis-1/3">
              <Label htmlFor="gemini-base-url" className="font-mono text-sm font-semibold">
                GOOGLE_GEMINI_BASE_URL
              </Label>
              <Badge variant="outline">string</Badge>
            </div>
            <Input
              id="gemini-base-url"
              value={envState.baseUrl}
              onChange={(event) => updateEnvField('baseUrl', event.target.value)}
              placeholder="https://generativelanguage.googleapis.com"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 md:basis-1/3">
              <Label htmlFor="gemini-model" className="font-mono text-sm font-semibold">
                GEMINI_MODEL
              </Label>
              <Badge variant="outline">string</Badge>
            </div>
            <Input
              id="gemini-model"
              value={envState.model}
              onChange={(event) => updateEnvField('model', event.target.value)}
              placeholder="gemini-2.5-pro"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            修改以上字段后请点击上方“保存”，系统会同步写入 settings.json 与 .env。
          </p>
          {envDirty && (
            <p className="text-xs text-amber-600">.env 内容已修改，记得通过保存按钮写回磁盘。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SchemaField({
  schema,
  value,
  onChange,
  onDelete,
  path,
  rootSchema,
  isRequired,
  showDescription = true,
  inline = false,
  rootValue,
}: SchemaFieldProps) {
  const resolvedSchema = resolveSchema(schema, rootSchema);
  const description = resolvedSchema?.description ?? DEFAULT_DESCRIPTION;
  const effectiveType = getEffectiveType(resolvedSchema, value);

  if (effectiveType === 'object') {
    return (
      <ObjectField
        schema={resolvedSchema ?? { type: 'object', additionalProperties: true }}
        value={value}
        onChange={onChange}
        path={path}
        rootSchema={rootSchema}
        description={description}
        rootValue={rootValue}
      />
    );
  }

  if (effectiveType === 'array') {
    return (
      <ArrayField
        schema={resolvedSchema ?? { type: 'array', items: {} }}
        value={value}
        onChange={onChange}
        path={path}
        rootSchema={rootSchema}
        description={description}
        rootValue={rootValue}
      />
    );
  }

  if (effectiveType === 'boolean') {
    return (
      <BooleanField
        value={value}
        onChange={onChange}
        description={description}
        showDescription={showDescription}
        inline={inline}
      />
    );
  }

  if (effectiveType === 'number' || effectiveType === 'integer') {
    return (
      <NumberField
        value={value}
        onChange={onChange}
        description={description}
        showDescription={showDescription}
        inline={inline}
      />
    );
  }

  if (effectiveType === 'string') {
    return (
      <StringField
        schema={resolvedSchema}
        value={value}
        onChange={onChange}
        description={description}
        showDescription={showDescription}
        inline={inline}
        rootValue={rootValue}
      />
    );
  }

  return (
    <FallbackJsonField
      value={value}
      onChange={onChange}
      description={description}
      allowDelete={!isRequired}
      onDelete={onDelete}
      showDescription={showDescription}
      inline={inline}
    />
  );
}

function StringField({
  schema,
  value,
  onChange,
  description,
  showDescription = true,
  inline = false,
  rootValue,
}: {
  schema?: JSONSchema;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  description: string;
  showDescription?: boolean;
  inline?: boolean;
  rootValue: JsonObject;
}) {
  const currentValue = typeof value === 'string' ? value : '';
  const enumValues = schema?.enum?.map((item) => String(item)) ?? [];
  const derivedOptions =
    schema?.['x-key-source'] && isJsonObject(rootValue)
      ? Object.keys(getObjectFromPath(rootValue, schema['x-key-source'] as string) ?? {})
      : [];
  const selectOptions = enumValues.length > 0 ? enumValues : derivedOptions;
  const hasSelectOptions = selectOptions.length > 0;
  const matchedOption =
    hasSelectOptions && selectOptions.includes(currentValue) ? currentValue : undefined;
  const CUSTOM_OPTION_VALUE = '__custom__';
  const isCustomSelected = hasSelectOptions ? !matchedOption : false;
  const shouldShowInput = !hasSelectOptions || isCustomSelected;
  const isSecretField = Boolean(schema?.['x-secret']);
  const renderTextInput = (inputClassName: string, parentIsRelative = false) => {
    if (isSecretField) {
      return (
        <SecretInput
          className={inputClassName}
          value={currentValue}
          onValueChange={(next) => onChange(next)}
          placeholder="请输入自定义内容"
          toggleLabel={`切换${schema?.title ?? '字段'}可见性`}
          withWrapper={!parentIsRelative}
          wrapperClassName={parentIsRelative ? undefined : 'w-full'}
        />
      );
    }

    return (
      <Input
        className={inputClassName}
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        placeholder="请输入自定义内容"
      />
    );
  };

  const renderSelect = (triggerClass: string) => (
    <Select
      value={isCustomSelected ? CUSTOM_OPTION_VALUE : (matchedOption ?? selectOptions[0])}
      onValueChange={(val) => {
        if (val === CUSTOM_OPTION_VALUE) {
          if (!isCustomSelected) {
            onChange('');
          }
          return;
        }
        onChange(val);
      }}
    >
      <SelectTrigger className={triggerClass}>
        <SelectValue placeholder="选择选项" />
      </SelectTrigger>
      <SelectContent>
        {selectOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM_OPTION_VALUE}>自定义</SelectItem>
      </SelectContent>
    </Select>
  );

  if (inline) {
    const selectClass = isCustomSelected ? 'w-fit min-w-[140px]' : 'flex-1 min-w-0';
    const inlineContainerClass = cn('flex w-full items-center gap-3 min-w-0', {
      relative: isSecretField,
    });
    return (
      <div className={inlineContainerClass}>
        {hasSelectOptions && renderSelect(selectClass)}
        {shouldShowInput && renderTextInput('flex-1 min-w-0', isSecretField)}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        className={cn('flex flex-wrap items-center gap-3', {
          relative: isSecretField,
        })}
      >
        {hasSelectOptions &&
          renderSelect(isCustomSelected ? 'w-fit min-w-[140px]' : 'flex-1 min-w-[200px]')}
        {shouldShowInput && renderTextInput('flex-1 min-w-[200px]', isSecretField)}
      </div>
      {showDescription && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  description,
  showDescription = true,
  inline = false,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  description: string;
  showDescription?: boolean;
  inline?: boolean;
}) {
  const currentValue = typeof value === 'number' && Number.isFinite(value) ? value : '';

  if (inline) {
    return (
      <div className="flex w-full items-center justify-end gap-3 min-w-0">
        <Input
          className="w-48"
          type="number"
          value={currentValue}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
          placeholder="请输入数字"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-40"
          type="number"
          value={currentValue}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
          placeholder="请输入数字"
        />
      </div>
      {showDescription && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function BooleanField({
  value,
  onChange,
  description,
  showDescription = true,
  inline = false,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  description: string;
  showDescription?: boolean;
  inline?: boolean;
}) {
  const currentValue = typeof value === 'boolean' ? value : false;

  if (inline) {
    return (
      <div className="flex w-full items-center justify-end gap-3 min-w-0">
        <Switch checked={currentValue} onCheckedChange={(checked) => onChange(checked)} />
        <span className="text-sm font-medium">{currentValue ? '启用' : '禁用'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <Switch checked={currentValue} onCheckedChange={(checked) => onChange(checked)} />
        <span className="text-sm font-medium">{currentValue ? '启用' : '禁用'}</span>
      </div>
      {showDescription && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function ArrayField({
  schema,
  value,
  onChange,
  path,
  rootSchema,
  description,
  rootValue,
}: {
  schema: JSONSchema;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  path: (string | number)[];
  rootSchema: JSONSchema | null;
  description: string;
  rootValue: JsonObject;
}) {
  const itemsSchema =
    Array.isArray(schema.items) && schema.items.length > 0
      ? schema.items[0]
      : (schema.items as JSONSchema | undefined);
  const resolvedItemsSchema = resolveSchema(itemsSchema, rootSchema);
  const currentValue = Array.isArray(value) ? value : [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const itemIds: string[] = currentValue.map((_, index) => formatPath([...path, index]));
  const shouldShowDescription =
    description && description !== DEFAULT_DESCRIPTION && description.trim().length > 0;

  const handleItemChange = (index: number, newValue: JsonValue) => {
    const next = [...currentValue];
    next[index] = newValue;
    onChange(next);
  };

  const handleRemoveItem = (index: number) => {
    const next = currentValue.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleAddItem = () => {
    const next = [...currentValue, getDefaultValue(resolvedItemsSchema)];
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = itemIds.indexOf(active.id as string);
    const newIndex = itemIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onChange(arrayMove(currentValue, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      {shouldShowDescription && <p className="text-xs text-muted-foreground">{description}</p>}
      {currentValue.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          当前数组为空
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {currentValue.map((item, index) => (
                <SortableArrayItem
                  key={itemIds[index]}
                  id={itemIds[index]}
                  schema={resolvedItemsSchema}
                  value={item}
                  onChange={(newValue) => handleItemChange(index, newValue)}
                  onDelete={() => handleRemoveItem(index)}
                  path={[...path, index]}
                  rootSchema={rootSchema}
                  rootValue={rootValue}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <Button variant="outline" size="sm" onClick={handleAddItem}>
        <Plus className="mr-1.5 h-4 w-4" />
        新增项目
      </Button>
    </div>
  );
}

interface SortableArrayItemProps {
  id: string;
  schema?: JSONSchema;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  onDelete: () => void;
  path: (string | number)[];
  rootSchema: JSONSchema | null;
  rootValue: JsonObject;
}

function SortableArrayItem({
  id,
  schema,
  value,
  onChange,
  onDelete,
  path,
  rootSchema,
  rootValue,
}: SortableArrayItemProps) {
  const resolvedSchema = resolveSchema(schema, rootSchema);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 ${
        isDragging ? 'opacity-70' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-600 focus-visible:outline-none"
        aria-label="拖拽排序"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <SchemaField
          schema={resolvedSchema}
          value={value}
          onChange={onChange}
          path={path}
          rootSchema={rootSchema}
          inline={!isCompoundField(resolvedSchema, value)}
          showDescription={false}
          rootValue={rootValue}
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ObjectField({
  schema,
  value,
  onChange,
  path,
  rootSchema,
  description,
  rootValue,
}: {
  schema: JSONSchema;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  path: (string | number)[];
  rootSchema: JSONSchema | null;
  description: string;
  rootValue: JsonObject;
}) {
  const objectValue = isJsonObject(value) ? value : {};
  const requiredKeys = schema.required ?? [];
  const currentKeys = Object.keys(objectValue);
  const keys = Array.from(new Set([...currentKeys, ...requiredKeys]));
  const schemaDefinedKeys = schema.properties ? Object.keys(schema.properties) : [];
  const availableSchemaKeys = schemaDefinedKeys
    .filter((key) => !currentKeys.includes(key) && !requiredKeys.includes(key))
    .sort((a, b) => a.localeCompare(b));
  const availableSchemaOptions = availableSchemaKeys.map((optionKey) => {
    const optionSchema = resolveObjectChildSchema(schema, optionKey, rootSchema);
    return {
      key: optionKey,
      description: optionSchema?.description ?? DEFAULT_DESCRIPTION,
    };
  });
  const isEnvObject = path.length === 1 && path[0] === 'env';

  const handleChildChange = (key: string, newValue: JsonValue) => {
    const next = { ...objectValue, [key]: newValue };
    onChange(next);
  };

  const handleDeleteChild = (key: string) => {
    const next = { ...objectValue };
    delete next[key];
    onChange(next);
  };

  const canAddCustomField = schema.additionalProperties !== false || !!schema.patternProperties;
  const [customKey, setCustomKey] = useState('');
  const [customFieldType, setCustomFieldType] = useState<CustomFieldType>('string');
  const [schemaKeyToAdd, setSchemaKeyToAdd] = useState('');

  const handleAddCustomField = () => {
    const normalizedKey = customKey.trim();
    if (!normalizedKey) {
      return;
    }
    if (objectValue[normalizedKey] !== undefined) {
      return;
    }
    const templateSchema =
      resolveObjectChildSchema(schema, normalizedKey, rootSchema) ??
      createSchemaForType(customFieldType);
    const next = { ...objectValue, [normalizedKey]: getDefaultValue(templateSchema) };
    onChange(next);
    setCustomKey('');
    setCustomFieldType('string');
  };

  const handleAddSchemaField = () => {
    if (!schemaKeyToAdd) {
      return;
    }
    if (objectValue[schemaKeyToAdd] !== undefined) {
      return;
    }
    const templateSchema = resolveObjectChildSchema(schema, schemaKeyToAdd, rootSchema);
    const next = { ...objectValue, [schemaKeyToAdd]: getDefaultValue(templateSchema) };
    onChange(next);
    setSchemaKeyToAdd('');
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-4 rounded-md border border-slate-200/80 p-3">
        {keys.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            尚未设置任何子选项
          </div>
        )}
        {keys.map((key) => {
          const resolvedChildSchema = resolveObjectChildSchema(schema, key, rootSchema);
          const isRequired = requiredKeys.includes(key);
          const childType = getEffectiveType(resolvedChildSchema, objectValue[key]);
          const childIsCompound = isCompoundField(resolvedChildSchema, objectValue[key]);

          return (
            <div key={key} className="space-y-2 rounded-md bg-white p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex items-center gap-2 md:basis-1/2">
                  <span className="font-mono text-sm font-semibold">{key}</span>
                  <Badge variant="outline">
                    {getTypeLabel(resolvedChildSchema, objectValue[key])}
                  </Badge>
                </div>
                <div
                  className={`flex items-center gap-3 md:basis-1/2 ${
                    childIsCompound ? 'md:justify-end w-full md:w-auto' : ''
                  }`}
                >
                  {!childIsCompound && (
                    <div
                      className={
                        childType === 'boolean'
                          ? 'flex-1 min-w-0 flex justify-end'
                          : 'flex-1 min-w-0'
                      }
                    >
                      <SchemaField
                        inline
                        schema={resolvedChildSchema}
                        value={objectValue[key]}
                        onChange={(newValue) => handleChildChange(key, newValue)}
                        path={[...path, key]}
                        rootSchema={rootSchema}
                        isRequired={isRequired}
                        showDescription={false}
                        rootValue={rootValue}
                      />
                    </div>
                  )}
                  {!isRequired && (
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteChild(key)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              {childIsCompound ? (
                <SchemaField
                  schema={resolvedChildSchema}
                  value={objectValue[key]}
                  onChange={(newValue) => handleChildChange(key, newValue)}
                  path={[...path, key]}
                  rootSchema={rootSchema}
                  isRequired={isRequired}
                  onDelete={!isRequired ? () => handleDeleteChild(key) : undefined}
                  rootValue={rootValue}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {resolvedChildSchema?.description ?? DEFAULT_DESCRIPTION}
                </p>
              )}
            </div>
          );
        })}
        {availableSchemaOptions.length > 0 && (
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <p className="text-xs text-muted-foreground md:basis-1/3">
              {isEnvObject ? '选择环境变量' : '从 Schema 添加子选项'}
            </p>
            <div className="flex flex-1 gap-2">
              <Select value={schemaKeyToAdd} onValueChange={setSchemaKeyToAdd}>
                <SelectTrigger>
                  <SelectValue placeholder={isEnvObject ? '选择环境变量' : '选择子选项'} />
                </SelectTrigger>
                <SelectContent>
                  {availableSchemaOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key} className="space-y-1">
                      <div className="flex flex-col text-left">
                        <span className="font-mono text-xs font-semibold">{option.key}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddSchemaField} disabled={!schemaKeyToAdd}>
                添加
              </Button>
            </div>
          </div>
        )}
        {canAddCustomField && (
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <p className="text-xs text-muted-foreground md:basis-1/3">自定义子选项</p>
            <div className="flex flex-1 gap-2 flex-wrap md:flex-nowrap">
              <Input
                className="flex-1"
                value={customKey}
                onChange={(event) => setCustomKey(event.target.value)}
                placeholder="新增子选项名"
              />
              <Select
                value={customFieldType}
                onValueChange={(value) => setCustomFieldType(value as CustomFieldType)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="类型" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddCustomField} disabled={!customKey.trim()}>
                添加
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function resolveObjectChildSchema(
  schema: JSONSchema,
  key: string,
  rootSchema: JSONSchema | null,
): JSONSchema | undefined {
  if (schema.properties && schema.properties[key]) {
    return resolveSchema(schema.properties[key], rootSchema);
  }

  if (schema.patternProperties) {
    for (const [pattern, patternSchema] of Object.entries(schema.patternProperties)) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(key)) {
          return resolveSchema(patternSchema, rootSchema);
        }
      } catch {
        // 忽略非法正则
      }
    }
  }

  if (isJsonSchemaObject(schema.additionalProperties)) {
    return resolveSchema(schema.additionalProperties, rootSchema);
  }

  return undefined;
}

function getObjectFromPath(root: JsonObject, path: string): JsonObject | undefined {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current: JsonValue | undefined = root;
  for (const segment of segments) {
    if (!isJsonObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return isJsonObject(current) ? current : undefined;
}

function FallbackJsonField({
  value,
  onChange,
  description,
  allowDelete,
  onDelete,
  showDescription = true,
  inline = false,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  description: string;
  allowDelete?: boolean;
  onDelete?: () => void;
  showDescription?: boolean;
  inline?: boolean;
}) {
  const input = (
    <Input
      className={inline ? 'flex-1 min-w-0' : 'flex-1 min-w-[220px]'}
      value={safeStringify(value)}
      onChange={(event) => {
        try {
          const parsed = JSON.parse(event.target.value);
          onChange(parsed as JsonValue);
        } catch {
          onChange(event.target.value);
        }
      }}
      placeholder="请输入值或 JSON"
    />
  );

  if (inline) {
    return (
      <div className="flex w-full items-center gap-3 min-w-0">
        {input}
        {allowDelete && onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        {input}
        {allowDelete && onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      {showDescription && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function resolveSchema(
  schema: JSONSchema | undefined,
  rootSchema: JSONSchema | null,
): JSONSchema | undefined {
  if (!schema) {
    return undefined;
  }
  if (schema.$ref && rootSchema) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (resolved) {
      const { $ref: _ref, ...rest } = schema;
      return { ...resolved, ...rest };
    }
  }
  return schema;
}

function resolveRef(schema: JSONSchema, ref: string): JSONSchema | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  const path = ref
    .substring(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = schema;
  for (const segment of path) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current as JSONSchema;
}

function getTypeLabel(schema?: JSONSchema, value?: JsonValue): string {
  const type = getPrimaryType(schema) ?? inferValueType(value);
  if (!type) {
    return 'string';
  }
  return type;
}

function getPrimaryType(schema?: JSONSchema): string | undefined {
  if (!schema) {
    return undefined;
  }
  if (Array.isArray(schema.type)) {
    return schema.type[0];
  }
  return schema.type;
}

function getEffectiveType(schema?: JSONSchema, value?: JsonValue): string | undefined {
  const schemaType = getPrimaryType(schema);
  if (schemaType) {
    return schemaType;
  }
  return inferValueType(value);
}

function inferValueType(value: JsonValue | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  return undefined;
}

function isCompoundField(schema?: JSONSchema, value?: JsonValue) {
  const type = getEffectiveType(schema, value);
  if (!type) {
    return Array.isArray(value) || isJsonObject(value);
  }
  return type === 'object' || type === 'array';
}

function getDefaultValue(schema?: JSONSchema): JsonValue {
  if (!schema) {
    return '';
  }

  if (schema.default !== undefined) {
    return cloneJsonValue(schema.default as JsonValue);
  }

  const type = getPrimaryType(schema);
  switch (type) {
    case 'object':
      return {};
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return 0;
    default:
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0] as JsonValue;
      }
      return '';
  }
}

function createSchemaForType(type?: CustomFieldType): JSONSchema | undefined {
  if (!type) {
    return undefined;
  }
  if (type === 'number') {
    return { type: 'number' };
  }
  return { type };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isJsonSchemaObject(value: unknown): value is JSONSchema {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonObject<T extends JsonObject>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeStringify(value: JsonValue | undefined) {
  try {
    if (value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function formatJson(value: JsonValue | undefined) {
  const text = safeStringify(value);
  return text || '—';
}

function buildDiffEntries(
  path: (string | number)[],
  original: JsonValue | undefined,
  current: JsonValue | undefined,
  diffs: DiffEntry[],
) {
  if (original === undefined && current === undefined) {
    return;
  }

  if (original === undefined && current !== undefined) {
    diffs.push({
      path: formatPath(path),
      type: 'added',
      after: cloneJsonValue(current as JsonValue),
    });
    return;
  }

  if (original !== undefined && current === undefined) {
    diffs.push({
      path: formatPath(path),
      type: 'removed',
      before: cloneJsonValue(original as JsonValue),
    });
    return;
  }

  if (isJsonObject(original) && isJsonObject(current)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
    keys.forEach((key) => {
      buildDiffEntries([...path, key], original[key], current[key], diffs);
    });
    return;
  }

  if (Array.isArray(original) && Array.isArray(current)) {
    const maxLength = Math.max(original.length, current.length);
    for (let index = 0; index < maxLength; index++) {
      buildDiffEntries([...path, index], original[index], current[index], diffs);
    }
    return;
  }

  if (JSON.stringify(original) !== JSON.stringify(current)) {
    diffs.push({
      path: formatPath(path),
      type: 'changed',
      before: cloneJsonValue(original as JsonValue),
      after: cloneJsonValue(current as JsonValue),
    });
  }
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return '(root)';
  }
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : String(segment);
  }, '');
}
