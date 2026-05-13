import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';

/**
 * Nova OS / kch-dev fork contract:
 *   - The clip menu exposes ONLY "Upload as Text" (com_ui_upload_ocr_text),
 *     and only when the agent has contextEnabled.
 *   - All upstream items (Upload to Provider, Upload Image, File Search,
 *     Code Files) are stripped — the tenant doesn't want those routes
 *     surfaced.
 *   - SharePoint integration is unchanged.
 *   - Basic rendering + disabled + edge-case behavior is unchanged.
 *
 * Reverting to upstream behavior = restore the createMenuItems branches
 * in AttachFileMenu.tsx and re-add the upstream coverage in this spec.
 */

jest.mock('~/hooks', () => ({
  useAgentCapabilities: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandlingNoChatContext: jest.fn(),
  useLocalize: jest.fn(),
}));

jest.mock('~/hooks/Files/useSharePointFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useSharePointFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

jest.mock('~/components/SharePoint', () => ({
  SharePointPickerDialog: () => null,
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    FileUpload: (props) => R.createElement('div', { 'data-testid': 'file-upload' }, props.children),
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement(
            'div',
            { 'data-testid': 'dropdown-menu' },
            props.items.map((item, idx) =>
              R.createElement(
                'button',
                { key: idx, onClick: item.onClick, 'data-testid': `menu-item-${idx}` },
                item.label,
              ),
            ),
          ),
      ),
    AttachmentIcon: () => R.createElement('span', { 'data-testid': 'attachment-icon' }),
    SharePointIcon: () => R.createElement('span', { 'data-testid': 'sharepoint-icon' }),
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

const mockUseAgentCapabilities = jest.requireMock('~/hooks').useAgentCapabilities;
const mockUseGetAgentsConfig = jest.requireMock('~/hooks').useGetAgentsConfig;
const mockUseFileHandlingNoChatContext = jest.requireMock('~/hooks').useFileHandlingNoChatContext;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseSharePointFileHandling = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).default;
const mockUseSharePointFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).useSharePointFileHandlingNoChatContext;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function setupMocks() {
  const translations: Record<string, string> = {
    com_ui_upload_provider: 'Upload to Provider',
    com_ui_upload_image_input: 'Upload Image',
    com_ui_upload_ocr_text: 'Upload as Text',
    com_ui_upload_file_search: 'Upload for File Search',
    com_ui_upload_code_files: 'Upload Code Files',
    com_sidepanel_attach_files: 'Attach Files',
    com_files_upload_sharepoint: 'Upload from SharePoint',
  };
  mockUseLocalize.mockReturnValue((key: string) => translations[key] || key);
  mockUseAgentCapabilities.mockReturnValue({
    contextEnabled: false,
    fileSearchEnabled: false,
    codeEnabled: false,
  });
  mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: {} });
  mockUseFileHandlingNoChatContext.mockReturnValue({ handleFileChange: jest.fn() });
  const sharePointReturnValue = {
    handleSharePointFiles: jest.fn(),
    isProcessing: false,
    downloadProgress: 0,
    error: null,
  };
  mockUseSharePointFileHandling.mockReturnValue(sharePointReturnValue);
  mockUseSharePointFileHandlingNoChatContext.mockReturnValue(sharePointReturnValue);
  mockUseGetStartupConfig.mockReturnValue({ data: { sharePointFilePickerEnabled: false } });
}

function renderMenu(props: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <AttachFileMenu
          conversationId="test-convo"
          files={new Map()}
          setFiles={() => {}}
          setFilesLoading={() => {}}
          conversation={null}
          {...props}
        />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /attach file options/i }));
}

describe('AttachFileMenu (Nova OS fork)', () => {
  beforeEach(jest.clearAllMocks);

  describe('Stripped menu shape', () => {
    it('shows ONLY "Upload as Text" when context is enabled', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: true,
        codeEnabled: true,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload as Text')).toBeInTheDocument();
      // Upstream items must be stripped regardless of capability flags.
      expect(screen.queryByText('Upload to Provider')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload Image')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload for File Search')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload Code Files')).not.toBeInTheDocument();
    });

    it('strips items even when provider is document-supported (anthropic)', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: false,
        codeEnabled: false,
      });
      renderMenu({ endpointType: EModelEndpoint.anthropic });
      openMenu();
      expect(screen.queryByText('Upload to Provider')).not.toBeInTheDocument();
      expect(screen.getByText('Upload as Text')).toBeInTheDocument();
    });

    it('strips items even when provider is non-document (agents)', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: false,
        codeEnabled: false,
      });
      renderMenu({ endpointType: EModelEndpoint.agents });
      openMenu();
      expect(screen.queryByText('Upload Image')).not.toBeInTheDocument();
      expect(screen.getByText('Upload as Text')).toBeInTheDocument();
    });

    it('renders an empty menu when context is disabled (no items at all)', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: false,
        codeEnabled: false,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.queryByText('Upload as Text')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload to Provider')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload Image')).not.toBeInTheDocument();
    });
  });

  describe('Basic Rendering', () => {
    it('renders the attachment button', () => {
      setupMocks();
      renderMenu();
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('is disabled when disabled prop is true', () => {
      setupMocks();
      renderMenu({ disabled: true });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeDisabled();
    });

    it('is not disabled when disabled prop is false', () => {
      setupMocks();
      renderMenu({ disabled: false });
      expect(screen.getByRole('button', { name: /attach file options/i })).not.toBeDisabled();
    });
  });

  describe('SharePoint Integration', () => {
    it('shows SharePoint option when enabled', () => {
      setupMocks();
      mockUseGetStartupConfig.mockReturnValue({
        data: { sharePointFilePickerEnabled: true },
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload from SharePoint')).toBeInTheDocument();
    });

    it('does NOT show SharePoint option when disabled', () => {
      setupMocks();
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.queryByText('Upload from SharePoint')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: undefined, endpointType: undefined });
      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
    });

    it('handles null endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: null, endpointType: null });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles missing agentId gracefully', () => {
      setupMocks();
      renderMenu({ agentId: undefined, endpointType: EModelEndpoint.openAI });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });
  });
});
