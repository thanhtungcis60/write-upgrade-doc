'use client';

import React, { useState, useRef } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

interface CategoryModel {
  Order: number | string;
  Name: string;
  Parent: number;
  NumberSubDir: number;
  Level: number;
}

interface SectionHeader {
  virtualAddress: number;
  virtualSize: number;
  rawDataPointer: number;
  rawDataSize: number;
}

const RT_VERSION = 16;

const alignToDword = (value: number) => (value + 3) & ~3;

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
  const [jsonConfig, setJsonConfig] = useState<string>(`[
    {
        "Order": 1,
        "Name": "DB",
        "Parent": 0,
        "NumberSubDir": 2,
        "Level": 2
    },
    {
        "Order": 1.1,
        "Name": "Script",
        "Parent": 1,
        "NumberSubDir": 0,
        "Level": 3
    },
    {
        "Order": 1.2,
        "Name": "PKG",
        "Parent": 1,
        "NumberSubDir":0,
        "Level": 3
    },
    {
        "Order": 2,
        "Name": "API",
        "Parent": 0,
        "NumberSubDir": 4,
        "Level": 2
    },
    {
        "Order": 2.1,
        "Name": "Topup.Viettel.Api",
        "Parent": 2,
        "NumberSubDir":0,
        "Level": 3
    },
    {
        "Order": 2.2,
        "Name": "Topup.Viettel.Webview",
        "Parent": 2,
        "NumberSubDir":0,
        "Level": 3
    },
    {
        "Order": 2.3,
        "Name": "TopupIRIS.CoreAPI",
        "Parent": 2,
        "NumberSubDir":0,
        "Level": 3
    },
    {
        "Order": 2.4,
        "Name": "TopupIRIS.Gateway",
        "Parent": 2,
        "NumberSubDir":0,
        "Level": 3
    },
    {
        "Order": 3,
        "Name": "TopupIRIS.Inquiry.Service",
        "Parent": 0,
        "NumberSubDir": 0,
        "Level": 2
    }   
]`);

  // State quản lý UI tiến trình
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');

  const handleSelectFolder = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleGenerateDoc = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      alert("Chưa chọn thư mục hoặc thư mục trống!");
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      setStatusText('Đang phân tích và gom nhóm dữ liệu...');

      const headerConfig: CategoryModel[] = JSON.parse(jsonConfig);
      
      // 1. Lọc ra các Group Cha (Level 2 / Parent: 0)
      const totalFiles = selectedFiles.length;
      
      // Chuyển FileList thành mảng để dễ xử lý
      const allFiles = Array.from(selectedFiles);
      const versionByPath = new Map<string, string>();

      for (const [index, file] of allFiles.entries()) {
        const version = await getPeFileVersion(file);
        versionByPath.set(file.webkitRelativePath || file.name, version);
        setProgress(Math.round(((index + 1) / totalFiles) * 70));
      }

      // 1. Xây dựng dữ liệu phân cấp 3 tầng: Groups (1, 2) -> SubGroups (1.1, 1.2) -> Files
    const finalDocumentData = headerConfig
      .filter(p => p.Parent === 0)
      .map(parent => ({
        groupOrder: parent.Order,
        groupName: parent.Name,
        subGroups: headerConfig
          .filter(child => child.Parent === parent.Order)
          .map(child => {
            // Lọc file thuộc về sub-group này
            const files = allFiles
              .filter(f => f.webkitRelativePath.toLowerCase().includes(`/${child.Name.toLowerCase()}/`))
              .map((f, idx) => ({
                stt: idx + 1,
                // MERGE LOGIC: Chỉ hiện module name ở file đầu tiên
                moduleName: idx === 0 ? child.Name : "", 
                fileName: f.name,
                date: new Date(f.lastModified).toLocaleDateString('vi-VN'),
                size: Math.round(f.size / 1024).toString(),
                version: versionByPath.get(f.webkitRelativePath || f.name) || ""
              }));
            
            return {
              subName: `${child.Order} ${child.Name}`, // 1.1, 1.2...
              files: files
            };
          })
          .filter(sub => sub.files.length > 0)
      }))
      .filter(group => group.subGroups.length > 0);
      

      if (finalDocumentData.length === 0) {
        alert("Không tìm thấy file nào khớp với cấu hình JSON.");
        setIsProcessing(false);
        return;
      }

      // ==== BẮT ĐẦU GHI RA WORD ====
      setStatusText('Đang nạp file Template.docx...');
      setProgress(80);
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch('/Template.docx');
      if (!response.ok) throw new Error("Không tìm thấy file Template.docx trong thư mục public");
      const templateBlob = await response.blob();
      const arrayBuffer = await templateBlob.arrayBuffer();

      setStatusText('Đang chèn dữ liệu vào Word...');
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 100));

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // BIND DATA THEO CẤU TRÚC MỚI (Có chứa mảng groups)
      doc.render({
        groups: finalDocumentData
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
      alert("Đã xảy ra lỗi: " + (error as Error).message);
      setIsProcessing(false);
      setProgress(0);
      setStatusText('');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <main className="p-10 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Document Generator</h1>
      
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">Cấu hình Header (JSON):</label>
        <textarea 
          className="w-full h-64 p-3 font-mono text-sm border rounded bg-gray-50 text-gray-800 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
          value={jsonConfig}
          onChange={(e) => setJsonConfig(e.target.value)}
          disabled={isProcessing}
        />
      </div>

      {/* Vùng hiển thị Progress Bar */}
      {isProcessing && (
        <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden shadow-inner">
          <div 
            className="bg-blue-600 h-6 rounded-full transition-all duration-200 ease-out flex items-center justify-center"
            style={{ width: `${progress}%` }}
          >
            {/* Hiển thị % nếu lớn hơn 5% để chữ không bị tràn ra ngoài thanh xanh */}
            {progress > 5 && <span className="text-white text-xs font-bold">{progress}%</span>}
          </div>
        </div>
      )}
      
      {/* Text trạng thái */}
      {statusText && (
        <p className="text-sm font-medium text-gray-600 italic">
          {statusText}
        </p>
      )}

      <div>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleGenerateDoc}
          className="hidden"
          // @ts-expect-error: webkitdirectory and directory are not standard properties
          webkitdirectory="true" 
          directory="true" 
          multiple
        />
        
        <button 
          onClick={handleSelectFolder}
          disabled={isProcessing}
          className={`font-bold py-3 px-6 rounded shadow-md transition-colors ${
            isProcessing 
            ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isProcessing ? 'Đang xử lý...' : 'Chọn thư mục nguồn & Xuất Word'}
        </button>
      </div>
    </main>
  );
}
