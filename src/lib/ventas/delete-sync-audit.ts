type DeleteSyncAuditParams = {
    supabase: any;
    documentType: 'sales_invoice' | 'sales_order';
    documentId: string;
    documentNumber?: string | null;
    requestedBy?: string | null;
    localAction: 'hard_delete' | 'soft_cancel' | 'none';
    localResult: 'deleted' | 'cancelled' | 'kept' | 'failed';
    zohoLinked: boolean;
    zohoExternalId?: string | null;
    zohoOperation?: 'void_invoice' | 'void_sales_order' | 'none';
    zohoResultStatus: 'not_required' | 'success' | 'pending' | 'failed';
    zohoErrorCode?: string | null;
    zohoErrorMessage?: string | null;
    syncJobId?: string | null;
    metadata?: Record<string, unknown> | null;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isMissingAuditTableError(errorMessage: string): boolean {
    const text = String(errorMessage || '').toLowerCase();
    return (
        text.includes('sales_delete_sync_audit') &&
        (text.includes('does not exist') || text.includes('could not find the table'))
    );
}

export async function recordDeleteSyncAudit(params: DeleteSyncAuditParams): Promise<void> {
    const {
        supabase,
        documentType,
        documentId,
        documentNumber = null,
        requestedBy = null,
        localAction,
        localResult,
        zohoLinked,
        zohoExternalId = null,
        zohoOperation = 'none',
        zohoResultStatus,
        zohoErrorCode = null,
        zohoErrorMessage = null,
        syncJobId = null,
        metadata = null,
    } = params;

    const payload = {
        document_type: documentType,
        document_id: documentId,
        document_number: normalizeText(documentNumber) || null,
        requested_by: normalizeText(requestedBy) || null,
        requested_at: new Date().toISOString(),
        local_action: localAction,
        local_result: localResult,
        zoho_linked: !!zohoLinked,
        zoho_external_id: normalizeText(zohoExternalId) || null,
        zoho_operation: zohoOperation,
        zoho_result_status: zohoResultStatus,
        zoho_error_code: normalizeText(zohoErrorCode) || null,
        zoho_error_message: normalizeText(zohoErrorMessage) || null,
        sync_job_id: normalizeText(syncJobId) || null,
        metadata: metadata || {},
    };

    const result = await supabase
        .from('sales_delete_sync_audit')
        .insert(payload)
        .select('id')
        .maybeSingle();

    if (result.error && !isMissingAuditTableError(result.error.message || '')) {
        console.warn('[delete-sync-audit] No se pudo registrar auditoría:', result.error.message);
    }
}
