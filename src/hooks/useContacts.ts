"use client";

import { useState, useEffect, useCallback } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import type { Contact } from "@/lib/types";

export function useContacts(teamId: string | null, sheetId: string | null = null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!teamId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const pb = getPocketBase();
      const records = await pb.collection("contacts").getFullList<Contact>({
        filter: `team="${teamId}"`,
      });

      if (!sheetId) {
        setContacts(records);
      } else {
        setContacts(records.filter((contact) => contact.sheet === sheetId));
      }
      setError(null);
    } catch (e) {
      setContacts([]);
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [teamId, sheetId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const addContact = async (data: Partial<Contact>) => {
    if (!teamId) {
      throw new Error("No team selected.");
    }
    const pb = getPocketBase();
    const record = await pb.collection("contacts").create<Contact>({
      ...data,
      team: teamId,
      sheet: data.sheet ?? sheetId ?? undefined,
      created_by: pb.authStore.record?.id,
    });
    setContacts((prev) => [record, ...prev]);
    return record;
  };

  const updateContact = async (id: string, data: Partial<Contact>) => {
    const pb = getPocketBase();
    const record = await pb.collection("contacts").update<Contact>(id, data);
    setContacts((prev) => prev.map((c) => (c.id === id ? record : c)));
    return record;
  };

  const deleteContact = async (id: string) => {
    const pb = getPocketBase();
    await pb.collection("contacts").delete(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  return {
    contacts,
    loading,
    error,
    refetch: fetchContacts,
    addContact,
    updateContact,
    deleteContact,
  };
}
