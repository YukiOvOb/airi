import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const openAIEmbedConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1'),
})

type OpenAIEmbedConfig = z.input<typeof openAIEmbedConfigSchema>

export const providerOpenAIEmbed = defineProvider<OpenAIEmbedConfig>({
  id: 'openai-embed',
  order: 15,
  name: 'OpenAI Embeddings',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-embed.title'),
  description: 'OpenAI text embedding models for semantic search',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-embed.description'),
  tasks: ['embeddings', 'semantic-search'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAIEmbedConfigSchema.extend({
    apiKey: openAIEmbedConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAIEmbedConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  extraMethods: {
    listModels: async () => [
      {
        id: 'text-embedding-3-small',
        name: 'text-embedding-3-small',
        provider: 'openai-embed',
        description: 'Fast and efficient embedding model (1536 dimensions)',
      },
      {
        id: 'text-embedding-3-large',
        name: 'text-embedding-3-large',
        provider: 'openai-embed',
        description: 'High-quality embedding model (3072 dimensions)',
      },
    ],
  },
})
