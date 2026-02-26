"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSharedTeam } from "@/hooks/useSharedTeam";
import { useContacts } from "@/hooks/useContacts";
import { useContactSheets } from "@/hooks/useContactSheets";
import ImportWizard from "@/components/csv/ImportWizard";
import CreateSheetModal from "@/components/sheets/CreateSheetModal";
import { getSheetTemplate, parseSheetFields } from "@/lib/sheetTemplates";

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { team, loading: teamLoading } = useSharedTeam();
  const {
    sheets,
    loading: sheetsLoading,
    error: sheetsError,
    createSheet,
  } = useContactSheets(team?.id ?? null);
  const {
    contacts,
    loading: contactsLoading,
    error: contactsError,
  } = useContacts(team?.id ?? null, null);

  const requestedSheetId = searchParams.get("sheet");
  const [selectedSheetChoice, setSelectedSheetChoice] = useState<string | null>(
    requestedSheetId
  );
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const selectedSheetId = useMemo(() => {
    if (selectedSheetChoice && sheets.some((sheet) => sheet.id === selectedSheetChoice)) {
      return selectedSheetChoice;
    }
    if (requestedSheetId && sheets.some((sheet) => sheet.id === requestedSheetId)) {
      return requestedSheetId;
    }
    return sheets[0]?.id ?? null;
  }, [requestedSheetId, selectedSheetChoice, sheets]);

  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === selectedSheetId) ?? null,
    [selectedSheetId, sheets]
  );
  const activeTemplate = getSheetTemplate(activeSheet?.template);

  if (teamLoading || sheetsLoading || contactsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xs text-[#737373]">Loading...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-6 py-8">
        <p className="text-xs text-[#737373]">No team found.</p>
      </div>
    );
  }

  if (contactsError || sheetsError) {
    return (
      <div className="px-6 py-8">
        {contactsError && (
          <p className="text-xs text-[#cc0000] mb-2">
            Failed to load contacts: {contactsError}
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
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-xs text-[#737373] hover:text-black transition-none"
        >
          ← Back to contacts
        </Link>

        <div className="flex items-center gap-2">
          <select
            value={selectedSheetId ?? ""}
            onChange={(e) => setSelectedSheetChoice(e.target.value)}
            className="text-xs border border-[#e5e5e5] px-2 py-1.5 bg-white outline-none focus:border-black"
          >
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
        </div>
      </div>

      {activeSheet ? (
        <>
          <div className="mb-6 border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 max-w-xl">
            <p className="text-xs font-medium">Importing into: {activeSheet.name}</p>
            <p className="text-xs text-[#737373] mt-1">
              {activeTemplate.name}: {activeTemplate.purpose}
            </p>
          </div>

          <ImportWizard
            teamId={team.id}
            sheetId={activeSheet.id}
            sheetTemplateId={activeSheet.template}
            sheetFields={parseSheetFields(activeSheet.fields, activeSheet.template)}
            existingContacts={contacts}
            onImportDone={() => router.push("/dashboard")}
          />
        </>
      ) : (
        <div className="max-w-xl border border-[#e5e5e5] px-4 py-4">
          <p className="text-xs text-[#737373]">
            Create or select a spreadsheet before importing CSV rows.
          </p>
        </div>
      )}

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
