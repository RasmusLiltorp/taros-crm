"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSharedTeam } from "@/hooks/useSharedTeam";
import { useContacts } from "@/hooks/useContacts";
import { useContactSheets } from "@/hooks/useContactSheets";
import ContactsTable from "@/components/contacts/ContactsTable";
import ContactPanel from "@/components/contacts/ContactPanel";
import QuickAddModal from "@/components/contacts/QuickAddModal";
import CreateSheetModal from "@/components/sheets/CreateSheetModal";
import { parseSheetFields, getSheetTemplate } from "@/lib/sheetTemplates";
import type { Contact } from "@/lib/types";

export default function DashboardPage() {
  const { team, loading: teamLoading } = useSharedTeam();
  const {
    sheets,
    loading: sheetsLoading,
    error: sheetsError,
    createSheet,
    deleteSheet,
  } = useContactSheets(team?.id ?? null);

  const [selectedSheetChoice, setSelectedSheetChoice] = useState<string | null>(null);
  const selectedSheetId = useMemo(() => {
    if (selectedSheetChoice && sheets.some((sheet) => sheet.id === selectedSheetChoice)) {
      return selectedSheetChoice;
    }
    return null;
  }, [selectedSheetChoice, sheets]);
  const {
    contacts,
    loading,
    error,
    addContact,
    updateContact,
    deleteContact,
  } = useContacts(team?.id ?? null, selectedSheetId);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [deletingSheet, setDeletingSheet] = useState(false);

  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === selectedSheetId) ?? null,
    [selectedSheetId, sheets]
  );
  const visibleSelectedContact = useMemo(() => {
    if (!selectedContact) return null;
    return contacts.some((contact) => contact.id === selectedContact.id)
      ? selectedContact
      : null;
  }, [contacts, selectedContact]);

  const activeTemplate = getSheetTemplate(activeSheet?.template);
  const activeFields = useMemo(() => {
    if (activeSheet) {
      return parseSheetFields(activeSheet.fields, activeSheet.template);
    }
    if (sheets.length === 0) {
      return parseSheetFields(null, null);
    }
    const unionMap = new Map<string, ReturnType<typeof parseSheetFields>[number]>();
    for (const sheet of sheets) {
      const fields = parseSheetFields(sheet.fields, sheet.template);
      for (const f of fields) {
        if (!unionMap.has(f.key)) {
          unionMap.set(f.key, f);
        }
      }
    }
    return Array.from(unionMap.values());
  }, [activeSheet, sheets]);

  const importHref = selectedSheetId
    ? `/dashboard/import?sheet=${selectedSheetId}`
    : "/dashboard/import";

  async function handleToggleContacted(id: string, val: boolean) {
    await updateContact(id, { contacted: val });
  }

  async function handleDeleteSheet() {
    if (!activeSheet || deletingSheet) return;
    const confirmed = window.confirm(
      `Delete spreadsheet "${activeSheet.name}"?\n\nContacts will be kept, but moved to "All spreadsheets".`
    );
    if (!confirmed) return;

    try {
      setDeletingSheet(true);
      await deleteSheet(activeSheet.id);
      setSelectedSheetChoice(null);
      setSelectedContact(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete spreadsheet.");
    } finally {
      setDeletingSheet(false);
    }
  }

  if (teamLoading || sheetsLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xs text-[#737373]">Loading...</p>
      </div>
    );
  }

  if (error || sheetsError) {
    return (
      <div className="px-6 py-8">
        {error && (
          <p className="text-xs text-[#cc0000] mb-2">
            Failed to load contacts: {error}
          </p>
        )}
        {sheetsError && (
          <p className="text-xs text-[#cc0000]">
            Failed to load spreadsheets: {sheetsError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-sm font-medium">
            {activeSheet ? activeSheet.name : "Contacts"}
          </h1>
          {activeSheet && (
            <p className="text-xs text-[#737373] mt-1">
              {activeTemplate.name}: {activeTemplate.purpose}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedSheetId ?? ""}
            onChange={(e) => setSelectedSheetChoice(e.target.value || null)}
            className="text-xs border border-[#e5e5e5] px-2 py-1.5 bg-white outline-none focus:border-black"
          >
            <option value="">All spreadsheets</option>
            {sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowCreateSheet(true)}
            className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
          >
            New spreadsheet
          </button>

          {activeSheet && (
            <button
              onClick={handleDeleteSheet}
              disabled={deletingSheet}
              className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-[#cc0000] hover:text-[#cc0000] transition-none disabled:opacity-50"
            >
              {deletingSheet ? "Deleting..." : "Delete spreadsheet"}
            </button>
          )}

          <Link
            href={importHref}
            className="text-xs border border-[#e5e5e5] px-3 py-1.5 hover:border-black transition-none"
          >
            Import CSV
          </Link>

          <button
            onClick={() => setShowQuickAdd(true)}
            className="text-xs border border-black bg-black text-white px-3 py-1.5 hover:bg-white hover:text-black transition-none"
          >
            + Add contact
          </button>
        </div>
      </div>

      {/* Table */}
      <ContactsTable
        contacts={contacts}
        fields={activeFields}
        onRowClick={setSelectedContact}
        onToggleContacted={handleToggleContacted}
      />

      {/* Side panel */}
      {visibleSelectedContact && (
        <ContactPanel
          contact={visibleSelectedContact}
          sheets={sheets}
          fields={activeFields}
          onClose={() => setSelectedContact(null)}
          onUpdate={updateContact}
          onDelete={deleteContact}
        />
      )}

      {/* Quick add modal */}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onAdd={(data) => {
            const payload: Partial<Contact> = selectedSheetId
              ? { ...data, sheet: selectedSheetId }
              : data;
            return addContact(payload);
          }}
          fields={activeFields}
          activeSheetName={activeSheet?.name ?? null}
          sheetTemplateId={activeSheet?.template ?? null}
        />
      )}

      {/* Create sheet modal */}
      {showCreateSheet && (
        <CreateSheetModal
          onClose={() => setShowCreateSheet(false)}
          onCreate={async (input) => {
            const created = await createSheet(input);
            setSelectedSheetChoice(created.id);
            return created;
          }}
        />
      )}
    </div>
  );
}
