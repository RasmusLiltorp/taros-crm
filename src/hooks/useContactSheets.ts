"use client";

import { useState, useEffect, useCallback } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import type { ContactSheet } from "@/lib/types";
import {
  DEFAULT_SHEET_TEMPLATE,
  type FieldDef,
  type ContactSheetTemplateId,
} from "@/lib/sheetTemplates";

interface CreateSheetInput {
  name: string;
  template?: ContactSheetTemplateId;
  fields?: FieldDef[];
  description?: string;
}

export function useContactSheets(teamId: string | null) {
  const [sheets, setSheets] = useState<ContactSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSheets = useCallback(async () => {
    if (!teamId) {
      setSheets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const pb = getPocketBase();
      const records = await pb.collection("contact_sheets").getFullList<ContactSheet>({
        filter: `team="${teamId}"`,
      });

      setSheets(records);
      setError(null);
    } catch (e) {
      setSheets([]);
      setError(e instanceof Error ? e.message : "Failed to load spreadsheets");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void fetchSheets();
  }, [fetchSheets]);

  const createSheet = async ({
    name,
    template = DEFAULT_SHEET_TEMPLATE,
    fields,
    description,
  }: CreateSheetInput) => {
    if (!teamId) {
      throw new Error("No team selected.");
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Spreadsheet name is required.");
    }

    const pb = getPocketBase();
    const record = await pb.collection("contact_sheets").create<ContactSheet>({
      team: teamId,
      name: trimmedName,
      template,
      fields: fields ?? null,
      description: description?.trim() ?? "",
      created_by: pb.authStore.record?.id,
    });

    setSheets((prev) => [...prev, record].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? "")));
    return record;
  };

  const deleteSheet = async (sheetId: string) => {
    if (!teamId) {
      throw new Error("No team selected.");
    }

    const pb = getPocketBase();

    // Keep contacts visible in "All spreadsheets" by unassigning their sheet first.
    const contactsInSheet = await pb.collection("contacts").getFullList<{ id: string }>({
      filter: `team="${teamId}" && sheet="${sheetId}"`,
      fields: "id",
    });

    if (contactsInSheet.length > 0) {
      const detachResults = await Promise.allSettled(
        contactsInSheet.map((contact) =>
          // PocketBase single relation fields are cleared with an empty string.
          pb.collection("contacts").update(contact.id, { sheet: "" })
        )
      );

      const failed = detachResults.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const firstFailure = failed[0];
        const firstError = firstFailure && "reason" in firstFailure
          ? firstFailure.reason
          : null;
        const message =
          firstError instanceof Error
            ? firstError.message
            : "Failed to detach one or more contacts from the spreadsheet.";
        throw new Error(message);
      }
    }

    await pb.collection("contact_sheets").delete(sheetId);
    setSheets((prev) => prev.filter((sheet) => sheet.id !== sheetId));
  };

  return {
    sheets,
    loading,
    error,
    refetch: fetchSheets,
    createSheet,
    deleteSheet,
  };
}
