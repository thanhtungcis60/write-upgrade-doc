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
      const parentGroups = headerConfig.filter(cat => cat.Parent === 0);
      
      const totalFiles = selectedFiles.length;
      
      // Chuyển FileList thành mảng để dễ xử lý
      const allFiles = Array.from(selectedFiles);

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
                version: ""
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