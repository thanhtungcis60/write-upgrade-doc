'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

interface CategoryModel {
  Order: number | string;
  Name: string;
  Parent: number | string;
  NumberSubDir: number;
  Level: number;
}

interface HeaderNode extends CategoryModel {
  children: HeaderNode[];
}

interface SectionHeader {
  virtualAddress: number;
  virtualSize: number;
  rawDataPointer: number;
  rawDataSize: number;
}

const RT_VERSION = 16;

const SAMPLE_HEADER_CONFIG_1: CategoryModel[] = [
  { Order: 1, Name: 'Client', Parent: 0, NumberSubDir: 3, Level: 2 },
  { Order: 1.1, Name: 'Counter', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.2, Name: 'Manager', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.3, Name: 'Center', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 2, Name: 'Core', Parent: 0, NumberSubDir: 3, Level: 2 },
  { Order: 2.1, Name: 'DB', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.2, Name: 'CAS', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.3, Name: 'Paypost', Parent: 2, NumberSubDir: 0, Level: 3 },
];

const SAMPLE_HEADER_CONFIG_2: CategoryModel[] = [
  { Order: 1, Name: 'DB', Parent: 0, NumberSubDir: 2, Level: 2 },
  { Order: 1.1, Name: 'Script', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.2, Name: 'PKG', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 2, Name: 'API', Parent: 0, NumberSubDir: 5, Level: 2 },
  { Order: 2.1, Name: 'Topup.Viettel.Api', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.2, Name: 'Topup.Viettel.Webview', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.3, Name: 'TopupIRIS.CoreAPI', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.4, Name: 'TopupIRIS.Gateway', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.5, Name: 'TopupIRIS.Backend.Site', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 3, Name: 'TopupIRIS.Inquiry.Service', Parent: 0, NumberSubDir: 0, Level: 2 },
];

const SAMPLE_HEADER_CONFIGS = [
  { id: 'sample-1', name: 'Sample PAYPOST', config: SAMPLE_HEADER_CONFIG_1 },
  { id: 'sample-2', name: 'Sample TOPUP', config: SAMPLE_HEADER_CONFIG_2 },
];

const DEFAULT_HEADER_CONFIG = SAMPLE_HEADER_CONFIG_2;

const alignToDword = (value: number) => (value + 3) & ~3;

const headerId = (value: number | string) => String(value);

const sameHeader = (left: number | string, right: number | string) => headerId(left) === headerId(right);

const isFakeBrowserPath = (value: string) => /fakepath/i.test(value);

const cleanFolderName = (value: string) => value.replace(/^\d+(?:[._ -]+)?/, '').trim();

const readUtf16NullTerminated = (view: DataView, offset: number, limit: number) => {
  let value = '';

  while (offset + 1 < limit) {
    const code = view.getUint16(offset, true);
    offset += 2;

    if (code === 0) break;
    value += String.fromCharCode(code);
  }

  return { value, nextOffset: offset };
};

const normalizeHeaderConfig = (config: CategoryModel[]) =>
  config.map((header) => ({
    ...header,
    NumberSubDir: config.filter((item) => sameHeader(item.Parent, header.Order)).length,
  }));

const buildHeaderTree = (config: CategoryModel[]) => {
  const buildChildren = (parentOrder: number | string): HeaderNode[] =>
    config
      .filter((item) => sameHeader(item.Parent, parentOrder))
      .sort((left, right) => Number(left.Order) - Number(right.Order))
      .map((item) => ({
        ...item,
        children: buildChildren(item.Order),
      }));

  return buildChildren(0);
};

const getNextRootOrder = (config: CategoryModel[]) => {
  const maxRootOrder = config
    .filter((item) => sameHeader(item.Parent, 0))
    .reduce((max, item) => Math.max(max, Number(item.Order) || 0), 0);

  return Math.floor(maxRootOrder) + 1;
};

const getNextChildOrder = (config: CategoryModel[], parent: CategoryModel) => {
  const parentOrder = headerId(parent.Order);
  const maxChildIndex = config
    .filter((item) => sameHeader(item.Parent, parent.Order))
    .reduce((max, item) => {
      const parts = headerId(item.Order).split('.');
      return Math.max(max, Number(parts[parts.length - 1]) || 0);
    }, 0);

  return `${parentOrder}.${maxChildIndex + 1}`;
};

const getDescendantOrders = (config: CategoryModel[], parentOrder: number | string) => {
  const descendants = new Set<string>();
  const collect = (order: number | string) => {
    config
      .filter((item) => sameHeader(item.Parent, order))
      .forEach((child) => {
        descendants.add(headerId(child.Order));
        collect(child.Order);
      });
  };

  collect(parentOrder);
  return descendants;
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const extractDocxFields = async (buffer: ArrayBuffer) => {
  const zip = new PizZip(buffer);
  const xmlFiles = Object.keys(zip.files)
    .filter((fileName) => /^word\/.*\.xml$/.test(fileName))
    .sort();

  const fields: string[] = [];

  xmlFiles.forEach((fileName) => {
    const xml = zip.file(fileName)?.asText() ?? '';
    const text = decodeXmlEntities(xml.replace(/<[^>]+>/g, ''));
    const matches = text.match(/\{[^{}]+\}/g) ?? [];
    fields.push(...matches);
  });

  return fields;
};

const compareDocxFields = (uploadedFields: string[], defaultFields: string[]) => {
  if (uploadedFields.length !== defaultFields.length) {
    return `Biểu mẫu cần có ${defaultFields.length} trường theo đúng thứ tự, nhưng file tải lên có ${uploadedFields.length} trường.`;
  }

  const differentIndex = defaultFields.findIndex((field, index) => field !== uploadedFields[index]);
  if (differentIndex >= 0) {
    return `Trường thứ ${differentIndex + 1} không khớp. Cần "${defaultFields[differentIndex]}", nhưng file tải lên là "${uploadedFields[differentIndex]}".`;
  }

  return '';
};

const getPeFileVersion = async (file: File) => {
  if (!/\.(dll|exe)$/i.test(file.name)) return '';

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    if (view.byteLength < 0x40 || view.getUint16(0, true) !== 0x5a4d) return '';

    const peOffset = view.getUint32(0x3c, true);
    if (peOffset + 24 >= view.byteLength || view.getUint32(peOffset, true) !== 0x00004550) return '';

    const sectionCount = view.getUint16(peOffset + 6, true);
    const optionalHeaderSize = view.getUint16(peOffset + 20, true);
    const optionalHeaderOffset = peOffset + 24;
    const optionalHeaderMagic = view.getUint16(optionalHeaderOffset, true);
    const dataDirectoryOffset = optionalHeaderOffset + (optionalHeaderMagic === 0x20b ? 112 : 96);
    if (optionalHeaderMagic !== 0x10b && optionalHeaderMagic !== 0x20b) return '';
    if (dataDirectoryOffset + 24 > view.byteLength) return '';

    const resourceDirectoryRva = view.getUint32(dataDirectoryOffset + 16, true);

    if (!resourceDirectoryRva) return '';

    const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
    const sections: SectionHeader[] = [];

    for (let i = 0; i < sectionCount; i += 1) {
      const sectionOffset = sectionTableOffset + i * 40;
      if (sectionOffset + 40 > view.byteLength) return '';

      sections.push({
        virtualSize: view.getUint32(sectionOffset + 8, true),
        virtualAddress: view.getUint32(sectionOffset + 12, true),
        rawDataSize: view.getUint32(sectionOffset + 16, true),
        rawDataPointer: view.getUint32(sectionOffset + 20, true),
      });
    }

    const rvaToOffset = (rva: number) => {
      const section = sections.find((item) => {
        const size = Math.max(item.virtualSize, item.rawDataSize);
        return rva >= item.virtualAddress && rva < item.virtualAddress + size;
      });

      return section ? section.rawDataPointer + (rva - section.virtualAddress) : -1;
    };

    const resourceDirectoryOffset = rvaToOffset(resourceDirectoryRva);
    if (resourceDirectoryOffset < 0) return '';

    const findResourceEntryOffset = (directoryOffset: number, id?: number): number => {
      if (directoryOffset < 0 || directoryOffset + 16 > view.byteLength) return -1;

      const namedEntryCount = view.getUint16(directoryOffset + 12, true);
      const idEntryCount = view.getUint16(directoryOffset + 14, true);
      const entryCount = namedEntryCount + idEntryCount;

      for (let i = 0; i < entryCount; i += 1) {
        const entryOffset = directoryOffset + 16 + i * 8;
        if (entryOffset + 8 > view.byteLength) return -1;

        const nameOrId = view.getUint32(entryOffset, true);
        const entryId = nameOrId & 0xffff;

        if (id === undefined || entryId === id) return entryOffset;
      }

      return -1;
    };

    const getSubdirectoryOffset = (entryOffset: number) => {
      if (entryOffset < 0) return -1;

      const offsetToData = view.getUint32(entryOffset + 4, true);
      const isDirectory = (offsetToData & 0x80000000) !== 0;

      return isDirectory ? resourceDirectoryOffset + (offsetToData & 0x7fffffff) : -1;
    };

    const versionTypeDirectory = getSubdirectoryOffset(findResourceEntryOffset(resourceDirectoryOffset, RT_VERSION));
    const versionNameDirectory = getSubdirectoryOffset(findResourceEntryOffset(versionTypeDirectory));
    const versionLanguageEntry = findResourceEntryOffset(versionNameDirectory);

    if (versionLanguageEntry < 0) return '';

    const dataEntryOffset = resourceDirectoryOffset + (view.getUint32(versionLanguageEntry + 4, true) & 0x7fffffff);
    if (dataEntryOffset + 16 > view.byteLength) return '';

    const versionInfoOffset = rvaToOffset(view.getUint32(dataEntryOffset, true));
    const versionInfoSize = view.getUint32(dataEntryOffset + 4, true);
    if (versionInfoOffset < 0 || versionInfoOffset + versionInfoSize > view.byteLength) return '';

    const key = readUtf16NullTerminated(view, versionInfoOffset + 6, versionInfoOffset + versionInfoSize);
    if (key.value !== 'VS_VERSION_INFO') return '';

    const fixedInfoOffset = versionInfoOffset + alignToDword(key.nextOffset - versionInfoOffset);
    if (fixedInfoOffset + 52 > versionInfoOffset + versionInfoSize) return '';
    if (view.getUint32(fixedInfoOffset, true) !== 0xfeef04bd) return '';

    const fileVersionMs = view.getUint32(fixedInfoOffset + 8, true);
    const fileVersionLs = view.getUint32(fixedInfoOffset + 12, true);

    return [
      (fileVersionMs >>> 16) & 0xffff,
      fileVersionMs & 0xffff,
      (fileVersionLs >>> 16) & 0xffff,
      fileVersionLs & 0xffff,
    ].join('.');
  } catch {
    return '';
  }
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configFileInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const [headerConfig, setHeaderConfig] = useState<CategoryModel[]>(() => normalizeHeaderConfig(DEFAULT_HEADER_CONFIG));
  const [activeSampleId, setActiveSampleId] = useState<string>('sample-2');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sourceFolder, setSourceFolder] = useState<string>('');
  const [sourceFolderError, setSourceFolderError] = useState<string>('');
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);
  const [selectedTemplatePath, setSelectedTemplatePath] = useState<string>('');
  const [newRootName, setNewRootName] = useState<string>('');
  const [newChildNameByOrder, setNewChildNameByOrder] = useState<Record<string, string>>({});
  const [activeChildInputOrder, setActiveChildInputOrder] = useState<string>('');
  const [editingOrder, setEditingOrder] = useState<string>('');
  const [editingName, setEditingName] = useState<string>('');
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [pendingDeleteHeader, setPendingDeleteHeader] = useState<CategoryModel | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [toastText, setToastText] = useState<string>('');
  const [templateModalMessage, setTemplateModalMessage] = useState<string>('');

  const headerTree = useMemo(() => buildHeaderTree(headerConfig), [headerConfig]);
  const hasSourceFolder = selectedFiles.length > 0 && Boolean(sourceFolder);
  const folderOptions = useMemo(() => {
    const options = new Set<string>();

    selectedFiles.forEach((file) => {
      const pathParts = file.webkitRelativePath.split('/').filter(Boolean);
      pathParts.slice(1, -1).forEach((folderName) => {
        options.add(folderName);

        const cleanedName = cleanFolderName(folderName);
        if (cleanedName) options.add(cleanedName);
      });
    });

    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [selectedFiles]);

  const updateConfig = (updater: (current: CategoryModel[]) => CategoryModel[]) => {
    setActiveSampleId('');
    setHeaderConfig((current) => normalizeHeaderConfig(updater(current)));
  };

  const handleSelectFolder = () => {
    fileInputRef.current?.click();
  };

  const handleClearSourceFolder = () => {
    setSelectedFiles([]);
    setSourceFolder('');
    setSourceFolderError('');
    setActiveChildInputOrder('');
    setEditingOrder('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setSourceFolderError('');

    const firstPath = files[0]?.webkitRelativePath;
    const localPath = (files[0] as (File & { path?: string }) | undefined)?.path;

    if (localPath && firstPath && !isFakeBrowserPath(localPath)) {
      const relativeParts = firstPath.split('/').filter(Boolean);
      const relativeAfterRoot = relativeParts.slice(1).join('\\');
      const normalizedLocalPath = localPath.replace(/\//g, '\\');

      if (relativeAfterRoot && normalizedLocalPath.endsWith(relativeAfterRoot)) {
        setSourceFolder(normalizedLocalPath.slice(0, -relativeAfterRoot.length).replace(/[\\/]$/, ''));
        return;
      }
    }

    if (localPath && !isFakeBrowserPath(localPath)) {
      const lastSeparator = Math.max(localPath.lastIndexOf('\\'), localPath.lastIndexOf('/'));
      setSourceFolder(lastSeparator >= 0 ? localPath.slice(0, lastSeparator) : localPath);
      return;
    }

    if (firstPath) {
      setSourceFolder(firstPath.split('/')[0] || firstPath);
      return;
    }

    setSourceFolder('');
  };

  const handleSampleChange = (sampleId: string) => {
    const sample = SAMPLE_HEADER_CONFIGS.find((item) => item.id === sampleId);
    if (!sample) return;

    setActiveSampleId(sampleId);
    setHeaderConfig(normalizeHeaderConfig(sample.config));
    setActiveChildInputOrder('');
    setEditingOrder('');
    setToastText(`Đã chuyển sang ${sample.name}.`);
  };

  const handleSelectTemplate = () => {
    templateFileInputRef.current?.click();
  };

  const handleClearTemplate = () => {
    setSelectedTemplateFile(null);
    setSelectedTemplatePath('');
    if (templateFileInputRef.current) templateFileInputRef.current.value = '';
  };

  const handleDownloadDefaultTemplate = async () => {
    const response = await fetch('/Template.docx');
    if (!response.ok) {
      setTemplateModalMessage('Không tìm thấy Template.docx mặc định trong thư mục public.');
      return;
    }

    const templateBlob = await response.blob();
    saveAs(templateBlob, 'Template.docx');
  };

  const handleTemplateFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const templateFile = event.target.files?.[0];
    if (!templateFile) return;

    const inputPath = event.currentTarget.value;
    const localPath = (templateFile as File & { path?: string }).path;
    const templatePath = localPath && !isFakeBrowserPath(localPath)
      ? localPath
      : inputPath && !isFakeBrowserPath(inputPath)
        ? inputPath
        : templateFile.name;

    try {
      const [defaultResponse, uploadedBuffer] = await Promise.all([fetch('/Template.docx'), templateFile.arrayBuffer()]);
      if (!defaultResponse.ok) throw new Error('Không tìm thấy Template.docx mặc định.');

      const defaultFields = await extractDocxFields(await defaultResponse.arrayBuffer());
      const uploadedFields = await extractDocxFields(uploadedBuffer);
      const compareMessage = compareDocxFields(uploadedFields, defaultFields);

      if (compareMessage) {
        setSelectedTemplateFile(null);
        setTemplateModalMessage(compareMessage);
        return;
      }

      setSelectedTemplateFile(templateFile);
      setSelectedTemplatePath(templatePath);
      setToastText('Biểu mẫu tải lên hợp lệ.');
    } catch (error) {
      setSelectedTemplateFile(null);
      setSelectedTemplatePath('');
      setTemplateModalMessage((error as Error).message || 'Không đọc được file biểu mẫu.');
    } finally {
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  const handleAddRoot = () => {
    const name = newRootName.trim();
    if (!name) return;

    updateConfig((current) => [
      ...current,
      {
        Order: getNextRootOrder(current),
        Name: name,
        Parent: 0,
        NumberSubDir: 0,
        Level: 2,
      },
    ]);
    setNewRootName('');
  };

  const handleAddChild = (parent: CategoryModel) => {
    const parentOrder = headerId(parent.Order);
    const name = (newChildNameByOrder[parentOrder] ?? '').trim();
    if (!name) return;

    updateConfig((current) => [
      ...current,
      {
        Order: getNextChildOrder(current, parent),
        Name: name,
        Parent: parent.Order,
        NumberSubDir: 0,
        Level: parent.Level + 1,
      },
    ]);
    setNewChildNameByOrder((current) => ({ ...current, [parentOrder]: '' }));
    setActiveChildInputOrder('');
  };

  const handleStartEdit = (header: CategoryModel) => {
    setEditingOrder(headerId(header.Order));
    setEditingName(header.Name);
  };

  const handleSaveEdit = () => {
    const name = editingName.trim();
    if (!editingOrder || !name) return;

    updateConfig((current) =>
      current.map((item) => (headerId(item.Order) === editingOrder ? { ...item, Name: name } : item)),
    );
    setEditingOrder('');
    setEditingName('');
  };

  const handleOpenDeleteConfirm = (event: React.MouseEvent<HTMLElement>, header: CategoryModel) => {
    setDeleteAnchorEl(event.currentTarget);
    setPendingDeleteHeader(header);
  };

  const handleCloseDeleteConfirm = () => {
    setDeleteAnchorEl(null);
    setPendingDeleteHeader(null);
  };

  const handleConfirmDeleteHeader = () => {
    if (!pendingDeleteHeader) return;

    updateConfig((current) => {
      const descendantOrders = getDescendantOrders(current, pendingDeleteHeader.Order);
      descendantOrders.add(headerId(pendingDeleteHeader.Order));

      return current.filter((item) => !descendantOrders.has(headerId(item.Order)));
    });

    handleCloseDeleteConfirm();
  };

  const handleSaveConfig = () => {
    const configBlob = new Blob([JSON.stringify(normalizeHeaderConfig(headerConfig), null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const fileName = `HSNC_HEADER_CONFIG_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;

    saveAs(configBlob, fileName);
    setToastText('Đã lưu cấu hình Header ra file.');
  };

  const handleLoadConfig = () => {
    configFileInputRef.current?.click();
  };

  const handleConfigFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const configFile = event.target.files?.[0];
    if (!configFile) return;

    try {
      const parsedConfig = JSON.parse(await configFile.text());
      if (!Array.isArray(parsedConfig)) throw new Error('Invalid config');

      setHeaderConfig(normalizeHeaderConfig(parsedConfig as CategoryModel[]));
      setActiveSampleId('');
      setToastText('Đã tải cấu hình Header từ file.');
    } catch {
      setToastText('File cấu hình Header không hợp lệ.');
    } finally {
      if (configFileInputRef.current) configFileInputRef.current.value = '';
    }
  };

  const handleGenerateDoc = async () => {
    if (!sourceFolder || selectedFiles.length === 0) {
      setSourceFolderError('Vui lòng chọn thư mục nguồn trước khi xuất Word.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      setStatusText('Đang phân tích và gom nhóm dữ liệu...');

      const allFiles = selectedFiles;
      const totalFiles = allFiles.length;
      const versionByPath = new Map<string, string>();

      for (const [index, file] of allFiles.entries()) {
        const version = await getPeFileVersion(file);
        versionByPath.set(file.webkitRelativePath || file.name, version);
        setProgress(Math.round(((index + 1) / totalFiles) * 70));
      }

      const normalizedConfig = normalizeHeaderConfig(headerConfig);
      const finalDocumentData = normalizedConfig
        .filter((parent) => sameHeader(parent.Parent, 0))
        .map((parent) => ({
          groupOrder: parent.Order,
          groupName: parent.Name,
          subGroups: normalizedConfig
            .filter((child) => sameHeader(child.Parent, parent.Order))
            .map((child) => {
              const files = allFiles
                .filter((file) => file.webkitRelativePath.toLowerCase().includes(`/${child.Name.toLowerCase()}/`))
                .map((file, index) => ({
                  stt: index + 1,
                  moduleName: index === 0 ? child.Name : '',
                  fileName: file.name,
                  date: new Date(file.lastModified).toLocaleDateString('vi-VN'),
                  size: Math.round(file.size / 1024).toString(),
                  version: versionByPath.get(file.webkitRelativePath || file.name) || '',
                }));

              return {
                subName: `${child.Order} ${child.Name}`,
                files,
              };
            })
            .filter((subGroup) => subGroup.files.length > 0),
        }))
        .filter((group) => group.subGroups.length > 0);

      if (finalDocumentData.length === 0) {
        alert('Không tìm thấy file nào khớp với cấu hình Header.');
        setIsProcessing(false);
        return;
      }

      setStatusText('Đang nạp file Template.docx...');
      setProgress(80);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const arrayBuffer = selectedTemplateFile
        ? await selectedTemplateFile.arrayBuffer()
        : await (async () => {
            const response = await fetch('/Template.docx');
            if (!response.ok) throw new Error('Không tìm thấy file Template.docx trong thư mục public');
            return response.arrayBuffer();
          })();

      setStatusText('Đang chèn dữ liệu vào Word...');
      setProgress(90);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render({
        groups: finalDocumentData,
      });

      setStatusText('Đang xuất file...');
      setProgress(95);

      const outBlob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const fileNameOutput = `HSNC_TOPUP_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.docx`;
      saveAs(outBlob, fileNameOutput);

      setProgress(100);
      setStatusText('Hoàn tất thành công!');

      setTimeout(() => {
        setIsProcessing(false);
        setStatusText('');
        setProgress(0);
      }, 2000);
    } catch (error) {
      console.error(error);
      alert('Đã xảy ra lỗi: ' + (error as Error).message);
      setIsProcessing(false);
      setProgress(0);
      setStatusText('');
    }
  };

  const renderHeaderNode = (node: HeaderNode) => {
    const order = headerId(node.Order);
    const isEditing = editingOrder === order;
    const isAddingChild = activeChildInputOrder === order;

    return (
      <Box component="li" key={order} sx={{ listStyle: 'none', pl: node.Level > 2 ? 2 : 0 }}>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ p: 1.5, alignItems: { xs: 'stretch', md: 'center' } }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
              <Chip label={node.Order} size="small" color={node.Level === 2 ? 'primary' : 'default'} />
              {isEditing ? (
                <>
                  <Autocomplete
                    freeSolo
                    options={folderOptions}
                    size="small"
                    inputValue={editingName}
                    value={editingName}
                    onInputChange={(_, value) => setEditingName(value)}
                    onChange={(_, value) => setEditingName(value ?? '')}
                    disabled={isProcessing}
                    sx={{ flex: 1, minWidth: 180 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Tìm folder trong thư mục nguồn"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleSaveEdit();
                          }
                        }}
                      />
                    )}
                  />
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SaveOutlinedIcon />}
                    onClick={handleSaveEdit}
                    disabled={isProcessing}
                  >
                    Lưu
                  </Button>
                  <Button variant="outlined" onClick={() => setEditingOrder('')} disabled={isProcessing}>
                    Hủy
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700 }}>
                    {node.Name}
                  </Typography>
                  <Chip label={`${node.NumberSubDir} con`} size="small" variant="outlined" />
                </>
              )}
            </Stack>

            {!isEditing && (
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: { xs: 'flex-end', md: 'center' } }}>
                {hasSourceFolder && (
                  <>
                    <Tooltip title="Thêm header con">
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setActiveChildInputOrder(order)}
                          disabled={isProcessing}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Sửa header">
                      <span>
                        <IconButton size="small" onClick={() => handleStartEdit(node)} disabled={isProcessing}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Xóa header">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(event) => handleOpenDeleteConfirm(event, node)}
                      disabled={isProcessing}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            )}
          </Stack>

          {isAddingChild && (
            <>
              <Divider />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ p: 1.5, bgcolor: '#fafafa' }}>
                <Autocomplete
                  freeSolo
                  options={folderOptions}
                  autoFocus
                  size="small"
                  inputValue={newChildNameByOrder[order] ?? ''}
                  value={newChildNameByOrder[order] ?? ''}
                  onInputChange={(_, value) =>
                    setNewChildNameByOrder((current) => ({ ...current, [order]: value }))
                  }
                  onChange={(_, value) =>
                    setNewChildNameByOrder((current) => ({ ...current, [order]: value ?? '' }))
                  }
                  disabled={isProcessing}
                  sx={{ flex: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Tìm folder trong thư mục nguồn"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleAddChild(node);
                        }

                        if (event.key === 'Escape') {
                          setActiveChildInputOrder('');
                        }
                      }}
                    />
                  )}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddChild(node)}
                  disabled={isProcessing}
                >
                  Thêm
                </Button>
                <Button variant="outlined" onClick={() => setActiveChildInputOrder('')} disabled={isProcessing}>
                  Hủy
                </Button>
              </Stack>
            </>
          )}
        </Box>

        {node.children.length > 0 && (
          <Box
            component="ul"
            sx={{
              mt: 1.5,
              ml: { xs: 1, sm: 2 },
              pl: 2,
              borderLeft: '2px solid',
              borderColor: 'divider',
              display: 'grid',
              gap: 1.5,
            }}
          >
            {node.children.map(renderHeaderNode)}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
            Trình viết HSNC
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2.5 }}>
          <Box>
            <Box sx={{ mb: 0.5 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <FolderOpenOutlinedIcon color="action" fontSize="small" />
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                  Thư mục nguồn
                </Typography>
              </Stack>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' },
                gap: 1.25,
                alignItems: 'start',
              }}
            >
              <TextField
                fullWidth
                value={sourceFolder}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: sourceFolder ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleClearSourceFolder} edge="end">
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                }}
                placeholder="Chưa chọn thư mục nguồn"
                size="small"
                error={Boolean(sourceFolderError)}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: 'stretch' }}>
                <Button
                  variant="outlined"
                  startIcon={<DriveFolderUploadIcon />}
                  onClick={handleSelectFolder}
                  disabled={isProcessing}
                  sx={{ minHeight: 40 }}
                >
                  Chọn thư mục
                </Button>
                {hasSourceFolder && (
                  <Button
                    variant="contained"
                    startIcon={<FileDownloadOutlinedIcon />}
                    onClick={handleGenerateDoc}
                    disabled={isProcessing}
                    sx={{ minHeight: 40 }}
                  >
                    {isProcessing ? 'Đang xử lý...' : 'Xuất Word'}
                  </Button>
                )}
              </Stack>
            </Box>

            {(sourceFolderError || selectedFiles.length > 0) && (
              <Typography
                variant="caption"
                color={sourceFolderError ? 'error' : 'text.secondary'}
                sx={{ display: 'block', mt: 0.75, pl: 1.75 }}
              >
                {sourceFolderError || `${selectedFiles.length} file đã chọn`}
              </Typography>
            )}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2.5 }}>
          <Box>
            <Box sx={{ mb: 0.5 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <UploadFileIcon color="action" fontSize="small" />
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                  Biểu mẫu
                </Typography>
              </Stack>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' },
                gap: 1.25,
                alignItems: 'start',
              }}
            >
              <TextField
                fullWidth
                value={selectedTemplatePath}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: selectedTemplateFile ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleClearTemplate} edge="end">
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                }}
                title={selectedTemplatePath}
                placeholder="Chưa tải biểu mẫu"
                size="small"
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={handleSelectTemplate}
                disabled={isProcessing}
                sx={{ minHeight: 40 }}
              >
                Tải biểu mẫu
              </Button>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, pl: 1.75 }}>
              Nếu không tải biểu mẫu sẽ sử dụng biểu mẫu{' '}
              <button
                type="button"
                onClick={handleDownloadDefaultTemplate}
                className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900"
              >
                mặc định
              </button>
              .
            </Typography>
          </Box>
        </Paper>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFolderChange}
          className="hidden"
          // @ts-expect-error: webkitdirectory and directory are not standard properties
          webkitdirectory="true"
          directory="true"
          multiple
        />
        <input
          type="file"
          ref={configFileInputRef}
          onChange={handleConfigFileChange}
          className="hidden"
          accept="application/json,.json"
        />
        <input
          type="file"
          ref={templateFileInputRef}
          onChange={handleTemplateFileChange}
          className="hidden"
          accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        />

        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ p: 2.5, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                Cấu hình Header
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {headerConfig.length} header đang cấu hình
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <TextField
                select
                size="small"
                label="Sample"
                value={activeSampleId}
                onChange={(event) => handleSampleChange(event.target.value)}
                disabled={isProcessing}
                sx={{ minWidth: 190 }}
              >
                <MenuItem value="" sx={{ display: 'none' }}>
                  Tùy chỉnh
                </MenuItem>
                {SAMPLE_HEADER_CONFIGS.map((sample) => (
                  <MenuItem key={sample.id} value={sample.id}>
                    {sample.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="success"
                startIcon={<SaveOutlinedIcon />}
                onClick={handleSaveConfig}
                disabled={isProcessing}
              >
                Lưu cấu hình
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={handleLoadConfig}
                disabled={isProcessing}
              >
                Tải cấu hình
              </Button>
            </Stack>
          </Stack>

          {hasSourceFolder && (
            <>
              <Divider />

              <Box sx={{ p: 2.5, bgcolor: '#f8fafc' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <Autocomplete
                    freeSolo
                    options={folderOptions}
                    fullWidth
                    size="small"
                    inputValue={newRootName}
                    value={newRootName}
                    onInputChange={(_, value) => setNewRootName(value)}
                    onChange={(_, value) => setNewRootName(value ?? '')}
                    disabled={isProcessing}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Tìm folder trong thư mục nguồn"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddRoot();
                          }
                        }}
                      />
                    )}
                  />
                  <Button
                    variant="contained"
                    color="inherit"
                    startIcon={<CreateNewFolderIcon />}
                    onClick={handleAddRoot}
                    disabled={isProcessing}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Thêm header gốc
                  </Button>
                </Stack>
              </Box>
            </>
          )}

          <Divider />

          <Box sx={{ p: 2.5 }}>
            <Box component="ul" sx={{ display: 'grid', gap: 1.5, p: 0, m: 0 }}>
              {headerTree.map(renderHeaderNode)}
            </Box>
          </Box>
        </Paper>

        {(isProcessing || statusText) && (
          <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2 }}>
            <Stack spacing={1.5}>
              {isProcessing && (
                <Box>
                  <Stack direction="row" sx={{ mb: 0.75, justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Tiến trình
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {progress}%
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 999 }} />
                </Box>
              )}
              {statusText && (
                <Alert icon={<TaskAltIcon fontSize="inherit" />} severity="info" sx={{ alignItems: 'center' }}>
                  {statusText}
                </Alert>
              )}
            </Stack>
          </Paper>
        )}

        <Popover
          open={Boolean(deleteAnchorEl)}
          anchorEl={deleteAnchorEl}
          onClose={handleCloseDeleteConfirm}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                borderRadius: 1,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'visible',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -6,
                  left: '50%',
                  width: 12,
                  height: 12,
                  bgcolor: 'background.paper',
                  borderLeft: '1px solid',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  transform: 'translateX(-50%) rotate(45deg)',
                },
              },
            },
          }}
        >
          <Box sx={{ p: 1.5, maxWidth: 360 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
              <WarningAmberIcon color="warning" fontSize="small" />
              <Typography variant="body2">
                {`Xóa header "${pendingDeleteHeader?.Name ?? ''}" và tất cả header con?`}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
              <Button size="small" variant="outlined" onClick={handleCloseDeleteConfirm}>
                Hủy
              </Button>
              <Button size="small" variant="contained" color="error" onClick={handleConfirmDeleteHeader}>
                Xóa
              </Button>
            </Stack>
          </Box>
        </Popover>

        <Snackbar
          open={Boolean(toastText)}
          autoHideDuration={3000}
          onClose={() => setToastText('')}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert severity="success" variant="filled" onClose={() => setToastText('')}>
            {toastText}
          </Alert>
        </Snackbar>

        {templateModalMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
            <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
              <div className="flex items-start gap-3 p-5 pb-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <WarningAmberIcon fontSize="small" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-base font-bold text-slate-950">Biểu mẫu không hợp lệ</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{templateModalMessage}</p>
                </div>
              </div>
              <div className="flex justify-end border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setTemplateModalMessage('')}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
