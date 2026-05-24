/**
 * Provider-API file forwarding for custom OpenAI-compatible endpoints
 * that implement the standard POST /v1/files endpoint and want LibreChat
 * uploads (paperclip → "Upload to Provider") to land in the provider's
 * own knowledge store rather than LibreChat's local /uploads dir.
 *
 * Activated per-endpoint via the `providerFileApi: true` flag in
 * librechat.yaml. Without that flag the behaviour is unchanged.
 *
 * Designed for Nova OS (MeganovaAI/nova-os), whose /v1/files handler
 * writes the bytes to disk + emits a supernova.UploadEvent so the
 * auto-index worker ingests chunks into the knowledge store the
 * document_retrieval skill reads from. See MeganovaAI/nova-os#516.
 */

const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const { extractEnvVariable } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');

const PROVIDER_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — matches nova-os /v1/files
const PROVIDER_UPLOAD_MAX_BYTES = 200 * 1024 * 1024; // 200 MB hard ceiling

/**
 * Find the custom endpoint config that owns the given endpoint name AND
 * has providerFileApi=true. Returns null when no match — caller should
 * fall through to the normal local-storage path.
 *
 * @param {object} appConfig
 * @param {string} endpointName
 * @returns {{ name: string, baseURL: string, apiKey: string, headers?: Record<string,string> } | null}
 */
function findProviderFilesEndpoint(appConfig, endpointName) {
  if (!endpointName) return null;
  const custom = appConfig?.endpoints?.custom;
  if (!Array.isArray(custom) || custom.length === 0) return null;
  const match = custom.find((e) => e?.name === endpointName && e?.providerFileApi === true);
  if (!match) return null;
  if (!match.baseURL || !match.apiKey) {
    logger.warn(
      `[providerFiles] endpoint ${endpointName} has providerFileApi:true but missing baseURL/apiKey — falling through to local storage`,
    );
    return null;
  }
  return match;
}

/**
 * Forward an uploaded multipart file to <baseURL>/files on a custom
 * OpenAI-compatible endpoint. Streams the file from disk so we don't
 * load large PDFs into memory. Returns the provider's JSON response
 * unchanged so the LibreChat client sees the OpenAI File object shape.
 *
 * On any non-2xx response, throws so the caller can surface an
 * "Upload to Provider failed" error to the user (rather than silently
 * dropping into local storage and pretending success).
 *
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {{ baseURL: string, apiKey: string, headers?: Record<string,string> }} params.endpointConfig
 * @param {string} params.purpose - "assistants" (OpenAI Files API default)
 * @returns {Promise<object>} parsed JSON body returned by the provider
 */
async function forwardFileToProvider({ req, endpointConfig, purpose = 'assistants' }) {
  const { file } = req;
  if (!file || !file.path) {
    throw new Error('forwardFileToProvider: req.file or req.file.path is missing');
  }

  const baseURL = endpointConfig.baseURL.replace(/\/+$/, '');
  const apiKey = extractEnvVariable(endpointConfig.apiKey);

  const form = new FormData();
  form.append('file', fs.createReadStream(file.path), {
    filename: file.originalname,
    contentType: file.mimetype,
  });
  form.append('purpose', purpose);

  const headers = {
    ...form.getHeaders(),
    Authorization: `Bearer ${apiKey}`,
  };
  // Pass through static endpoint headers (e.g. X-Protocol: ag-ui) so
  // the provider sees the same envelope it does on chat-completions.
  if (endpointConfig.headers && typeof endpointConfig.headers === 'object') {
    for (const [k, v] of Object.entries(endpointConfig.headers)) {
      if (typeof v === 'string' && v !== '') {
        headers[k] = v;
      }
    }
  }

  logger.debug(
    `[providerFiles] forwarding ${file.originalname} (${file.size}B, ${file.mimetype}) → ${baseURL}/files`,
  );

  const resp = await axios.post(`${baseURL}/files`, form, {
    headers,
    timeout: PROVIDER_UPLOAD_TIMEOUT_MS,
    maxContentLength: PROVIDER_UPLOAD_MAX_BYTES,
    maxBodyLength: PROVIDER_UPLOAD_MAX_BYTES,
    validateStatus: (s) => s >= 200 && s < 300,
  });

  return resp.data;
}

module.exports = {
  findProviderFilesEndpoint,
  forwardFileToProvider,
};
