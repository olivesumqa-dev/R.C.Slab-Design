import { useEffect, useMemo, useState } from "react";

type SaveMode = "save" | "saveas";

type SavedCalculation = {
  id: number;
  calcType: string;
  name: string;
  folder: string;
  data: unknown;
  updatedAt: string;
};

const STORAGE_KEY = "rc-slab-calculations";

function readSaved(): SavedCalculation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSaved(records: SavedCalculation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveCalculation(calcType: string, record: { id?: number | null; name: string; folder: string; data: unknown }) {
  const records = readSaved();
  const id = record.id ?? Date.now();
  const nextRecord: SavedCalculation = {
    id,
    calcType,
    name: record.name,
    folder: record.folder,
    data: record.data,
    updatedAt: new Date().toISOString(),
  };
  const index = records.findIndex((item) => item.id === id && item.calcType === calcType);
  if (index >= 0) records[index] = nextRecord;
  else records.unshift(nextRecord);
  writeSaved(records);
  return nextRecord;
}

export function loadCalculation(id: number, calcType: string) {
  return readSaved().find((item) => item.id === id && item.calcType === calcType) ?? null;
}

export function SaveDialog({ mode, currentName, currentFolder, onSave, onClose }: {
  mode: SaveMode;
  currentName: string;
  currentFolder: string;
  onSave: (name: string, folder: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName || "RC Slab Calculation");
  const [folder, setFolder] = useState(currentFolder || "Projects");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter a calculation name.");
      return;
    }
    try {
      await onSave(name.trim(), folder.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/45 px-4 no-print">
      <form onSubmit={submit} className="w-full max-w-md rounded bg-white p-6 shadow-2xl">
        <h2 className="font-serif text-2xl text-slate-900">{mode === "save" ? "Save Calculation" : "Save As"}</h2>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-widest text-slate-600">Name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-slate-600">Folder</label>
        <input value={folder} onChange={(event) => setFolder(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button type="submit" className="rounded bg-blue-900 px-4 py-2 text-sm font-semibold text-white">Save</button>
        </div>
      </form>
    </div>
  );
}

export function LoadDialog({ calcType, onLoad, onClose }: {
  calcType: string;
  onLoad: (id: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<SavedCalculation[]>([]);
  const visibleRecords = useMemo(() => records.filter((item) => item.calcType === calcType), [records, calcType]);

  useEffect(() => setRecords(readSaved()), []);

  const remove = (id: number) => {
    const next = readSaved().filter((item) => !(item.id === id && item.calcType === calcType));
    writeSaved(next);
    setRecords(next);
  };

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/45 px-4 no-print">
      <div className="w-full max-w-xl rounded bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-slate-900">Load Calculation</h2>
            <p className="mt-1 text-sm text-slate-500">Saved calculations are stored in this browser.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">Close</button>
        </div>
        <div className="mt-5 max-h-80 overflow-y-auto divide-y divide-slate-200 rounded border border-slate-200">
          {visibleRecords.length === 0 && <p className="p-4 text-sm text-slate-500">No saved slab calculations yet.</p>}
          {visibleRecords.map((record) => (
            <div key={record.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold text-slate-900">{record.name}</p>
                <p className="text-xs text-slate-500">{record.folder || "Projects"} · {new Date(record.updatedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onLoad(record.id)} className="rounded bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white">Load</button>
                <button type="button" onClick={() => remove(record.id)} className="rounded border border-slate-300 px-3 py-1.5 text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
