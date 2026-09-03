import React, { useRef, useState } from "react";
import { Plus, ArrowUp, Bell, FileText, X, PanelLeft, Image as ImageIcon, Camera, Square, Mic, Loader2, FileSpreadsheet } from "lucide-react";
import type { ThemeType } from "../../theme";

export interface ImageAttachment {
  id: string;
  previewUrl: string;
  dataUrl?: string;
  publicUrl?: string;
  name: string;
  size: number;
  uploading: boolean;
  error?: string;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;
  base64?: string;
}

interface ChatInputProps {
  theme: ThemeType;
  onSend: (text: string, images?: string[], documents?: DocumentAttachment[]) => void;
  disabled?: boolean;
  isProcessing?: boolean;
  onToggleObservations?: () => void;
  showObservations?: boolean;
  isMobileView?: boolean;
  onOpenSidebar?: () => void;
  onCancelChat?: () => void;
}

export function ChatInput({ 
  theme, 
  onSend, 
  disabled,
  isProcessing,
  onToggleObservations,
  showObservations,
  isMobileView,
  onOpenSidebar,
  onCancelChat
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [documentAttachments, setDocumentAttachments] = useState<DocumentAttachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  const uploadImageFile = (file: File) => {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = URL.createObjectURL(file);
    const newAttachment: ImageAttachment = {
      id,
      previewUrl,
      name: file.name || 'image.png',
      size: file.size,
      uploading: true
    };
    setImageAttachments(prev => [...prev, newAttachment]);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;

      // Smart Client-Side Resizing (Max 1600px) to ensure lightning-fast upload
      const img = new Image();
      img.src = rawDataUrl;
      img.onload = async () => {
        let finalDataUrl = rawDataUrl;
        try {
          const maxDim = 1600;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              finalDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            }
          }
        } catch {
          finalDataUrl = rawDataUrl;
        }

        // Store dataUrl immediately so image is guaranteed ready for vision even before server upload
        setImageAttachments(prev => prev.map(item => item.id === id ? { ...item, dataUrl: finalDataUrl } : item));

        const apiUrl = import.meta.env.VITE_API_URL || 
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://127.0.0.1:3001' 
            : 'https://api.seraos.xyz');

        try {
          const res = await fetch(`${apiUrl}/api/upload/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: finalDataUrl, filename: file.name })
          });
          const data = await res.json();
          if (data && data.url && typeof data.url === 'string' && !data.url.startsWith('blob:')) {
            setImageAttachments(prev => prev.map(item => item.id === id ? { ...item, publicUrl: data.url, uploading: false } : item));
          } else {
            setImageAttachments(prev => prev.map(item => item.id === id ? { ...item, publicUrl: finalDataUrl, uploading: false } : item));
          }
        } catch {
          setImageAttachments(prev => prev.map(item => item.id === id ? { ...item, publicUrl: finalDataUrl, uploading: false } : item));
        }
      };
    };
  };

  const uploadDocumentFile = (file: File) => {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const isBinary = ext === 'xlsx' || ext === 'xls' || ext === 'pdf';

    const reader = new FileReader();
    if (isBinary) {
      reader.readAsDataURL(file);
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || dataUrl;
        setDocumentAttachments(prev => [...prev, {
          id,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          base64
        }]);
      };
    } else {
      reader.readAsText(file);
      reader.onload = () => {
        const text = reader.result as string;
        setDocumentAttachments(prev => [...prev, {
          id,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          content: text
        }]);
      };
    }
  };

  const handleAttachOption = (type: 'document' | 'image' | 'camera') => {
    setShowAttachMenu(false);
    if (fileInputRef.current) {
      if (type === 'document') {
        fileInputRef.current.accept = '.csv,.xlsx,.xls,.json,.txt,.md,.pdf';
        fileInputRef.current.removeAttribute('capture');
      } else if (type === 'image') {
        fileInputRef.current.accept = 'image/*';
        fileInputRef.current.removeAttribute('capture');
      } else if (type === 'camera') {
        fileInputRef.current.accept = 'image/*';
        fileInputRef.current.setAttribute('capture', 'environment');
      }
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type.startsWith('image/')) {
      uploadImageFile(file);
    } else {
      uploadDocumentFile(file);
    }
    e.target.value = ''; // Reset
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            uploadImageFile(file);
            return;
          }
        }
      }
    }

    const text = e.clipboardData.getData("text/plain");
    if (text.length > 250 || text.split('\n').length > 5) {
      e.preventDefault();
      setAttachments(prev => [...prev, text]);
    }
  };

  const isImageUploading = imageAttachments.some(img => img.uploading && !img.dataUrl);

  const handleSend = () => {
    const hasText = !!input.trim();
    const hasAttachments = attachments.length > 0;
    const hasImages = imageAttachments.length > 0;
    const hasDocs = documentAttachments.length > 0;

    if ((!hasText && !hasAttachments && !hasImages && !hasDocs) || disabled || isImageUploading) return;
    
    let finalText = "";
    if (attachments.length > 0) {
      attachments.forEach((att, i) => {
        finalText += `[Pasted Context ${i + 1}]\n${att}\n\n`;
      });
    }
    finalText += input.trim();

    // CRITICAL: Filter out any local browser blob: URLs so Qwen never encounters download errors!
    const imageUrls = imageAttachments
      .map(img => img.publicUrl || img.dataUrl)
      .filter((url): url is string => Boolean(url && !url.startsWith('blob:')));
    
    onSend(
      finalText.trim(), 
      imageUrls.length > 0 ? imageUrls : undefined,
      documentAttachments.length > 0 ? documentAttachments : undefined
    );
    setInput("");
    setAttachments([]);
    setImageAttachments([]);
    setDocumentAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const canSend = isProcessing || (!isImageUploading && (input.trim() || attachments.length > 0 || imageAttachments.length > 0 || documentAttachments.length > 0) && !disabled);

  return (
    <div style={{ padding: "0", flexShrink: 0 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
        
        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 24,
            padding: "12px 14px 10px",
          }}
        >
          {/* Image, Document & Text Attachments Preview Strip */}
          {(attachments.length > 0 || imageAttachments.length > 0 || documentAttachments.length > 0) && (
            <div style={{ display: "flex", gap: 10, padding: "4px 8px 12px", overflowX: "auto", flexWrap: "wrap" }}>
              {/* Image Previews: Clean square thumbnail with floating X button */}
              {imageAttachments.map((img) => (
                <div 
                  key={img.id} 
                  style={{
                    position: "relative",
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${theme.border}`,
                    background: "#000",
                    flexShrink: 0
                  }}
                >
                  <img 
                    src={img.previewUrl} 
                    alt="preview" 
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} 
                  />
                  {img.uploading && (
                    <div style={{
                      position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <Loader2 size={16} color="#FFF" style={{ animation: "spin 1s linear infinite" }} />
                    </div>
                  )}
                  <button 
                    onClick={() => setImageAttachments(prev => prev.filter(i => i.id !== img.id))} 
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      background: "rgba(0, 0, 0, 0.65)",
                      backdropFilter: "blur(4px)",
                      border: "none",
                      borderRadius: "50%",
                      width: 18,
                      height: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "#FFF",
                      padding: 0
                    }}
                    title="Remove image"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              ))}

              {/* Document Attachments: Excel / CSV / TXT chips */}
              {documentAttachments.map((doc) => {
                const isSpreadsheet = doc.name.endsWith('.csv') || doc.name.endsWith('.xlsx') || doc.name.endsWith('.xls');
                const sizeKb = (doc.size / 1024).toFixed(1);
                return (
                  <div key={doc.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: theme.surface2, padding: "6px 10px", borderRadius: 10,
                    border: `1px solid ${theme.border}`, fontSize: 13, color: theme.ink
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isSpreadsheet ? (
                        <FileSpreadsheet size={16} color="#10B981" />
                      ) : (
                        <FileText size={16} color={theme.accent} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", maxWidth: 160, overflow: "hidden" }}>
                        <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {doc.name}
                        </span>
                        <span style={{ fontSize: 11, color: theme.inkFaint }}>{sizeKb} KB</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setDocumentAttachments(prev => prev.filter(d => d.id !== doc.id))} 
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, display: "flex", padding: 2, marginLeft: 4 }}
                      title="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}

              {/* Pasted text attachments */}
              {attachments.map((_, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: theme.surface2, padding: "6px 10px", borderRadius: 8,
                  border: `1px solid ${theme.border}`, fontSize: 13, color: theme.ink
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
                    <FileText size={14} color={theme.inkSoft} />
                    <span style={{ fontWeight: 500 }}>Pasted Context</span>
                  </div>
                  <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, display: "flex", padding: 2, marginLeft: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="chatui-textarea"
            value={input}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything..."
            rows={1}
            disabled={disabled}
            style={{
              width: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: theme.ink,
              fontFamily: "Inter, sans-serif",
              fontSize: isMobileView ? 16 : 15,
              lineHeight: 1.5,
              padding: "2px 8px 10px",
              maxHeight: 160,
              minHeight: 24,
              boxSizing: "border-box"
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <div style={{ display: "flex", gap: 8, paddingLeft: 6, position: "relative" }}>
              {isMobileView && onOpenSidebar && (
                <button
                  title="Menu"
                  onClick={onOpenSidebar}
                  style={{
                    background: "transparent", border: "none", color: theme.inkSoft, 
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  <PanelLeft size={20} />
                </button>
              )}
              <div ref={menuRef} style={{ position: "relative" }}>
                <button
                  title="Attach file"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={disabled}
                  style={{
                    background: showAttachMenu ? theme.surface2 : "transparent", border: "none", 
                    color: showAttachMenu ? theme.ink : theme.inkSoft, 
                    cursor: disabled ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 8, padding: 4, transition: "all 0.2s"
                  }}
                >
                  <Plus size={20} />
                </button>
                

                {/* Pop-up Menu */}
                {showAttachMenu && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: 0, marginBottom: 8,
                    background: theme.surface, border: `1px solid ${theme.border}`,
                    borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                    display: "flex", flexDirection: "column", gap: 2, minWidth: 160, zIndex: 50,
                    animation: "walletPageIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  }}>
                    <button
                      onClick={() => handleAttachOption('document')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <FileText size={16} color={theme.inkSoft} />
                      Document
                    </button>
                    <button
                      onClick={() => handleAttachOption('image')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <ImageIcon size={16} color={theme.inkSoft} />
                      Image
                    </button>
                    <button
                      onClick={() => handleAttachOption('camera')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Camera size={16} color={theme.inkSoft} />
                      Camera
                    </button>
                  </div>
                )}
              </div>
              
              {/* System Notifications icon */}
              <button
                title="System Notifications"
                onClick={onToggleObservations}
                disabled={disabled}
                style={{
                  background: showObservations ? theme.surface2 : "transparent", border: "none", 
                  color: showObservations ? theme.ink : theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, padding: 4, transition: "all 0.2s",
                  position: "relative"
                }}
              >
                <Bell size={20} />
              </button>
            </div>
            
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                title="Voice input"
                disabled={disabled}
                style={{
                  background: "transparent", border: "none", 
                  color: theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, padding: 4, transition: "all 0.2s"
                }}
              >
                <Mic size={20} />
              </button>

              <button
                onClick={() => {
                  if (isProcessing) {
                    if (onCancelChat) onCancelChat();
                  } else {
                    handleSend();
                  }
                }}
                disabled={!canSend}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "none",
                  background: isProcessing ? theme.surface2 : (canSend ? theme.accent : theme.surface2),
                  color: isProcessing ? theme.ink : (canSend ? theme.accentInk : theme.inkSoft),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canSend ? "pointer" : "default",
                  flexShrink: 0,
                  transform: canSend ? "scale(1)" : "scale(0.95)",
                  transition: "all 180ms ease",
                }}
              >
                {isProcessing ? (
                  <Square size={14} fill="currentColor" strokeWidth={0} />
                ) : (
                  <ArrowUp size={18} />
                )}
              </button>
            </div>
          </div>
        </div>

        {!isMobileView && (
          <div style={{ textAlign: "center", fontSize: 11, color: theme.inkSoft, fontFamily: "Inter, sans-serif", marginTop: 14 }}>
            Sera can make mistakes. Verify important information.
          </div>
        )}
      </div>
    </div>
  );
}
