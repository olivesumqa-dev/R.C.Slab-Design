import React, { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { FileSpreadsheet, X, Lock, Plus, Trash2, FolderOpen, Folder, ChevronDown, ChevronRight, Calculator } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import SpreadsheetEditor from "@/components/spreadsheet-editor";
import RCBeamCalculator from "@/components/rc-beam-calculator";
import RCColumnCalculator from "@/components/rc-column-calculator";
import RCFootingCalculator from "@/components/rc-footing-calculator";
import RCSlabCalculator from "@/components/rc-slab-calculator";

interface StructuralFile {
  id: number;
  name: string;
  description: string;
  category: string;
  fileKey: string;
  uploadedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-zinc-800",
  Foundation: "bg-stone-800",
  Framing: "bg-neutral-700",
  Electrical: "bg-zinc-700",
  Plumbing: "bg-stone-700",
  Finishing: "bg-neutral-800",
  Calculators: "bg-emerald-900",
};

// ── Calculator detection helpers ──────────────────────────────────────────────
// A "calculator" record is identified by its fileKey starting with "calc:".
// e.g. fileKey = "calc:rc_beam" for the RC Beam Calculator.
function isCalculator(file: StructuralFile): boolean {
  return file.fileKey?.startsWith("calc:") ?? false;
}
function calcTypeOf(file: StructuralFile): string {
  return file.fileKey.slice("calc:".length);
}

export default function StructuralPage() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [files, setFiles] = useState<StructuralFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [openFile, setOpenFile] = useState<StructuralFile | null>(null);
  const [openCalculator, setOpenCalculator] = useState<StructuralFile | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addCat, setAddCat] = useState("General");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addError, setAddError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map: Record<string, StructuralFile[]> = {};
    for (const f of files) {
      if (!map[f.category]) map[f.category] = [];
      map[f.category].push(f);
    }
    return map;
  }, [files]);

  const toggleFolder = (cat: string) =>
    setOpenFolders((prev) => ({ ...prev, [cat]: !prev[cat] }));

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      api.getStructuralFiles()
        .then(setFiles)
        .catch(() => setFiles([]))
        .finally(() => setFilesLoading(false));
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!addFile) { setAddError("Please select an Excel file to upload."); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", addFile);
      formData.append("name", addName);
      formData.append("description", addDesc);
      formData.append("category", addCat);
      const record = await api.uploadStructuralFile(formData);
      setFiles((prev) => [...prev, record]);
      setShowAddForm(false);
      setAddName(""); setAddDesc(""); setAddCat("General"); setAddFile(null);
    } catch (err: any) {
      setAddError(err.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this file? This cannot be undone.")) return;
    await api.deleteStructuralFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Click handler: route to spreadsheet editor or calculator overlay
  const handleCardClick = (file: StructuralFile) => {
    if (isCalculator(file)) setOpenCalculator(file);
    else setOpenFile(file);
  };

  // Map calc type → component
  const renderCalculator = (file: StructuralFile) => {
    const type = calcTypeOf(file);
    if (type === "rc_beam") {
      return (
        <RCBeamCalculator
          key={file.id}
          title={file.name}
          onClose={() => setOpenCalculator(null)}
        />
      );
    }
    if (type === "rc_column") {
      return (
        <RCColumnCalculator
          key={file.id}
          title={file.name}
          onClose={() => setOpenCalculator(null)}
        />
      );
    }
    if (type === "rc_footing") {
      return (
        <RCFootingCalculator
          key={file.id}
          title={file.name}
          onClose={() => setOpenCalculator(null)}
        />
      );
    }
    if (type === "rc_slab") {
      return (
        <RCSlabCalculator
          key={file.id}
          title={file.name}
          onClose={() => setOpenCalculator(null)}
        />
      );
    }
    // Future: more calculators
    return null;
  };

  if (loading) return null;
  if (!user) return null;

  return (
    <>
      {/* Spreadsheet editor overlay (for .xlsx files) */}
      <AnimatePresence>
        {openFile && (
          <SpreadsheetEditor
            key={openFile.id}
            fileId={openFile.id}
            fileName={openFile.name}
            onClose={() => setOpenFile(null)}
          />
        )}
      </AnimatePresence>

      {/* Calculator overlay (for calc: entries) */}
      <AnimatePresence>
        {openCalculator && renderCalculator(openCalculator)}
      </AnimatePresence>

      <div className="min-h-screen bg-background text-foreground">
        <header className="fixed top-0 left-0 right-0 z-50 px-6 py-8 md:px-12 flex justify-between items-center bg-background/90 backdrop-blur-sm border-b border-border">
          <Link href="/" className="hover:opacity-60 transition-opacity flex flex-col leading-none gap-[3px] shrink-0">
            <span className="font-sans font-semibold text-[42px] uppercase leading-none" style={{ letterSpacing: "0.12em", WebkitTextStroke: "1.5px hsl(var(--foreground))", color: "transparent" }}>Architects Plans <span style={{ fontSize: "0.55em", verticalAlign: "middle", opacity: 0.6 }}>beta v.1.20</span></span>
            <span className="font-sans font-normal text-[11px] tracking-widest uppercase">by: Oliver A. Sumampong</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="font-sans text-xs text-muted-foreground hidden md:block">{user.email}</span>
            <button onClick={handleLogout} className="font-sans text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          </div>
        </header>

        <main className="pt-44 px-6 md:px-12 pb-24">
          <div className="max-w-screen-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-12 flex items-end justify-between border-b border-border pb-8"
            >
              <div>
                <p className="font-sans text-xs tracking-widest uppercase text-muted-foreground mb-3">Members Area</p>
                <h1 className="font-serif text-5xl md:text-6xl leading-tight tracking-tight">Structural Files</h1>
                <p className="font-sans text-sm text-muted-foreground mt-3">Click any file to open and edit. Changes are saved to your account.</p>
              </div>
              <div className="flex items-center gap-4">
                {user.role === "admin" && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center gap-2 font-sans text-xs tracking-widest uppercase bg-foreground text-background px-4 py-2.5 rounded hover:opacity-80 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Upload File
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-full">
                  <Lock className="w-3 h-3" />
                  {user.role === "admin" ? "Admin" : "Member"}
                </span>
              </div>
            </motion.div>

            {filesLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-secondary animate-pulse rounded" />
                ))}
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-32">
                <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="font-sans text-muted-foreground text-sm">No structural files yet.</p>
                {user.role === "admin" && (
                  <p className="font-sans text-muted-foreground/60 text-xs mt-2">Use "Upload File" above to add your first Excel file.</p>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(grouped).map(([category, catFiles]) => {
                  const isOpen = openFolders[category] !== false;
                  const FolderIcon = isOpen ? FolderOpen : Folder;
                  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;
                  return (
                    <motion.div
                      key={category}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <button
                        onClick={() => toggleFolder(category)}
                        className="flex items-center gap-2.5 mb-4 group w-full text-left"
                      >
                        <ChevronIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <FolderIcon className={`w-4.5 h-4.5 transition-colors ${CATEGORY_COLORS[category] ? "text-foreground/70" : "text-muted-foreground"} group-hover:text-foreground`} style={{ width: 18, height: 18 }} />
                        <span className="font-sans text-xs tracking-widest uppercase text-muted-foreground group-hover:text-foreground transition-colors">{category}</span>
                        <span className="font-sans text-[10px] text-muted-foreground/50 ml-1">({catFiles.length})</span>
                        <div className="flex-1 h-px bg-border ml-2" />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-hidden"
                          >
                            {catFiles.map((file) => {
                              const isCalc = isCalculator(file);
                              const Icon = isCalc ? Calculator : FileSpreadsheet;
                              return (
                                <motion.div
                                  key={file.id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.35 }}
                                  className="group cursor-pointer"
                                  onClick={() => handleCardClick(file)}
                                >
                                  <div className={`relative aspect-[3/4] rounded overflow-hidden ${CATEGORY_COLORS[file.category] ?? "bg-zinc-800"} flex flex-col items-center justify-center transition-all duration-300 group-hover:scale-[1.02] group-hover:ring-2 group-hover:ring-foreground/30`}>
                                    <Icon className="w-12 h-12 text-white/40 mb-3 group-hover:text-white/60 transition-colors" />
                                    <span className="font-sans text-[10px] tracking-widest uppercase text-white/30">
                                      {isCalc ? "Calculator" : file.category}
                                    </span>
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100">
                                      <span className="font-sans text-[10px] tracking-widest uppercase text-white/80">
                                        {isCalc ? "Open Calculator" : "Open & Edit"}
                                      </span>
                                    </div>
                                    {user.role === "admin" && (
                                      <button
                                        onClick={(e) => handleDelete(file.id, e)}
                                        className="absolute top-2 right-2 p-1.5 rounded bg-black/40 text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete file"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="mt-2.5 px-0.5">
                                    <p className="font-sans text-sm text-foreground truncate">{file.name}</p>
                                    <p className="font-sans text-xs text-muted-foreground truncate mt-0.5">{file.description || file.category}</p>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Upload form modal */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setShowAddForm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-background border border-border rounded-lg w-full max-w-md p-8 relative max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button className="absolute top-4 right-4 text-muted-foreground hover:text-foreground" onClick={() => setShowAddForm(false)}>
                  <X className="w-5 h-5" />
                </button>
                <h2 className="font-serif text-2xl mb-6">Upload Structural File</h2>
                {addError && <p className="text-sm text-destructive mb-4">{addError}</p>}
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="block font-sans text-xs tracking-widest uppercase text-muted-foreground mb-1.5">Excel File</label>
                    <label className={`flex items-center justify-center w-full border-2 border-dashed rounded px-4 py-6 cursor-pointer transition-colors ${addFile ? "border-foreground/40 bg-secondary" : "border-border hover:border-foreground/30"}`}>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setAddFile(f);
                          if (f && !addName) setAddName(f.name.replace(/\.[^.]+$/, ""));
                        }}
                      />
                      <div className="text-center">
                        <FileSpreadsheet className={`w-8 h-8 mx-auto mb-2 ${addFile ? "text-foreground" : "text-muted-foreground"}`} />
                        <p className="font-sans text-sm text-muted-foreground">
                          {addFile ? addFile.name : "Click to choose an Excel file (.xlsx, .xls)"}
                        </p>
                        {addFile && <p className="font-sans text-xs text-muted-foreground/60 mt-1">{(addFile.size / 1024).toFixed(0)} KB</p>}
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="block font-sans text-xs tracking-widest uppercase text-muted-foreground mb-1.5">Display Name</label>
                    <input required value={addName} onChange={(e) => setAddName(e.target.value)} className="w-full bg-secondary border border-border rounded px-4 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="e.g. RC Beam Calculator" />
                  </div>
                  <div>
                    <label className="block font-sans text-xs tracking-widest uppercase text-muted-foreground mb-1.5">Description</label>
                    <input value={addDesc} onChange={(e) => setAddDesc(e.target.value)} className="w-full bg-secondary border border-border rounded px-4 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block font-sans text-xs tracking-widest uppercase text-muted-foreground mb-1.5">Category</label>
                    <select value={addCat} onChange={(e) => setAddCat(e.target.value)} className="w-full bg-secondary border border-border rounded px-4 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground">
                      {Object.keys(CATEGORY_COLORS).map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={uploading} className="w-full bg-foreground text-background font-sans text-sm tracking-widest uppercase py-3 rounded hover:opacity-80 transition-opacity disabled:opacity-40">
                    {uploading ? "Uploading…" : "Upload File"}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
