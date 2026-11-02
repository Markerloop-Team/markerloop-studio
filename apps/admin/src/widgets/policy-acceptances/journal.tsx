"use client";

import * as React from "react";
import { AlertTriangle, SearchX } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { DataView, type DataViewField } from "@/shared/components/data-view";
import { usePolicyEdition } from "@/entities/policy";
import {
  downloadCsv,
  editionInForce,
  editionStatus,
  formatAcceptedAt,
  journalCsvName,
  policyAcceptancesApi,
  totalPages,
  usePolicyJournal,
  usePolicySummary,
  type PolicyAcceptance,
  type PolicyEditionSummary,
  type PolicyJournalMode,
  type PolicyJournalPage,
} from "@/entities/policy-acceptance";
import {
  BrowserCell,
  EditionBadge,
  ExportCsvButton,
  IpCell,
  PersonCell,
} from "./cells";

export const JOURNAL_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The journal of rule acceptances across people (SDL-752), laid out after the
 * canvas /design-system/policy-acceptances (`?case=journal|empty|empty-journal`).
 * Search, the edition modes and pagination are the service's: every change is
 * a new GET /v1/policy-acceptances. Mounted only behind the journal
 * permission, so an account without it never sends a request.
 */
export function PolicyJournal() {
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [mode, setMode] = React.useState<PolicyJournalMode>({ kind: "all" });
  const [page, setPage] = React.useState(1);

  // The page goes back to 1 in the same update that changes the filter — an
  // effect after render would first send the old page with the new filter.
  // `search` holds the trimmed value: a keystroke that does not change it (a
  // trailing space) and the first mount schedule nothing.
  React.useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const id = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput, search]);
  const changeMode = (next: PolicyJournalMode) => {
    setMode(next);
    setPage(1);
  };

  const query = React.useMemo(
    () => ({ search, mode, page, limit: JOURNAL_PAGE_SIZE }),
    [search, mode, page]
  );
  const journal = usePolicyJournal(query);
  const summary = usePolicySummary();
  const edition = usePolicyEdition();

  return (
    <PolicyJournalView
      searchInput={searchInput}
      appliedSearch={search}
      onSearchChange={setSearchInput}
      mode={mode}
      onModeChange={changeMode}
      page={page}
      onPageChange={setPage}
      // Unknown edition in force → no Current/Outdated, never a guess.
      currentEdition={editionInForce(edition?.version)}
      data={journal.data}
      loading={journal.isPending}
      placeholder={journal.isPlaceholderData}
      fetching={journal.isFetching}
      error={journal.isError && !journal.data}
      onRetry={() => void journal.refetch()}
      summary={summary.data}
      summaryError={summary.isError}
      onExport={async () => {
        // What is typed, not the debounced value: a click right after typing
        // exports the filter the person sees in the field.
        const rows = await policyAcceptancesApi.listAll(searchInput, mode);
        downloadCsv(journalCsvName(mode), rows);
      }}
      onReset={() => {
        setSearchInput("");
        setSearch("");
        setMode({ kind: "all" });
        setPage(1);
      }}
    />
  );
}

export type PolicyJournalViewProps = {
  searchInput: string;
  /** The search the data on screen was asked with (after the debounce). */
  appliedSearch: string;
  onSearchChange: (value: string) => void;
  mode: PolicyJournalMode;
  onModeChange: (mode: PolicyJournalMode) => void;
  page: number;
  onPageChange: (page: number) => void;
  /** The contour's edition in force; null — unknown, no Current/Outdated. */
  currentEdition: string | null;
  data: PolicyJournalPage | undefined;
  loading: boolean;
  /** The rows are the previous query's, kept while the new one loads. */
  placeholder?: boolean;
  fetching?: boolean;
  error: boolean;
  onRetry: () => void;
  summary: PolicyEditionSummary | undefined;
  summaryError?: boolean;
  onExport: () => Promise<void>;
  onReset: () => void;
};

/** Editions the Select offers: the summary's plus the edition in force. */
export function editionOptions(
  summary: PolicyEditionSummary | undefined,
  current: string | null
): string[] {
  const set = new Set<string>(summary?.editions.map((e) => e.version) ?? []);
  if (current) set.add(current);
  return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function PolicyJournalView(props: PolicyJournalViewProps) {
  const t = useTranslations("policyAcceptances");
  const { data, mode, currentEdition } = props;

  const filtered =
    Boolean(props.searchInput.trim()) || Boolean(props.appliedSearch.trim()) || mode.kind !== "all";
  const rows = data?.acceptances ?? [];
  const total = data?.total ?? 0;
  const pageCount = totalPages(total, JOURNAL_PAGE_SIZE);
  // «Nobody accepted anything yet» is known only from the ANSWER to an
  // unfiltered request: not from the previous filter's rows kept on screen
  // while the next request runs, and not from the field alone — the field is
  // emptied before the debounced request goes. Taken any earlier, the toolbar
  // with the field under the person's cursor would unmount mid-typing.
  const journalEmpty =
    !props.placeholder &&
    !props.appliedSearch.trim() &&
    mode.kind === "all" &&
    data !== undefined &&
    total === 0;
  // Empty rows kept from the previous query say nothing about the new one:
  // while it loads, show loading rather than an empty card.
  const loading = props.loading || (Boolean(props.placeholder) && rows.length === 0);

  const fields = React.useMemo<DataViewField<PolicyAcceptance>[]>(
    () => [
      {
        id: "user",
        label: t("columns.user"),
        render: (a) => <PersonCell email={a.email} username={a.username} />,
        card: "title",
      },
      {
        id: "edition",
        label: t("columns.edition"),
        render: (a) => (
          <EditionBadge version={a.version} current={currentEdition} testid="acceptance-edition" />
        ),
        card: "field",
      },
      {
        id: "accepted_at",
        label: t("columns.acceptedAt"),
        render: (a) => (
          <UI.Text as="span" size="sm" className="whitespace-nowrap tabular-nums">
            {formatAcceptedAt(a.accepted_at)}
          </UI.Text>
        ),
        card: "field",
      },
      {
        id: "ip",
        label: t("columns.ip"),
        render: (a) => <IpCell ip={a.ip} />,
        card: "field",
      },
      {
        id: "browser",
        label: t("columns.browser"),
        render: (a) => <BrowserCell userAgent={a.user_agent} source={a.source} />,
        card: "field",
      },
    ],
    [t, currentEdition]
  );

  return (
    <UI.Tooltip.Provider>
      <UI.Box
        direction="column"
        gap={3}
        data-testid="journal"
        data-total={data ? total : undefined}
        data-state={
          props.error ? "error" : loading ? "loading" : journalEmpty ? "empty-journal" : "ready"
        }
        aria-busy={props.fetching ? true : undefined}
      >
        {journalEmpty ? null : (
          <EditionSummary
            summary={props.summary}
            failed={Boolean(props.summaryError)}
            currentEdition={currentEdition}
            value={mode.kind === "current" ? mode.version : ""}
            onChange={(version) =>
              props.onModeChange(version ? { kind: "current", version } : { kind: "all" })
            }
          />
        )}

        {journalEmpty ? (
          <JournalEmpty filtered={filtered} onReset={props.onReset} />
        ) : (
          // The admin's one list (EP-186, pattern 1): toolbar (search, the
          // edition Select, export, the count), table from 768px, cards below,
          // one pager. The journal's own loading / error / empty cards replace
          // both branches under the toolbar.
          <DataView
            fields={fields}
            data={rows}
            getRowId={(a) => a.id}
            searchValue={props.searchInput}
            onSearchChange={props.onSearchChange}
            searchPlaceholder={t("searchPlaceholder")}
            filters={
              <>
                <UI.FormControl.Select.Root
                  value={mode.kind === "edition" ? mode.version : "all"}
                  onValueChange={(value: string) =>
                    props.onModeChange(
                      value === "all" ? { kind: "all" } : { kind: "edition", version: value }
                    )
                  }
                >
                  <UI.FormControl.Select.Trigger
                    width={200}
                    aria-label={t("editionFilterAria")}
                    data-testid="journal-edition-filter"
                  >
                    <UI.FormControl.Select.Value placeholder={t("allEditions")} />
                  </UI.FormControl.Select.Trigger>
                  <UI.FormControl.Select.Content>
                    <UI.FormControl.Select.Item value="all">{t("allEditions")}</UI.FormControl.Select.Item>
                    {editionOptions(props.summary, currentEdition).map((version) => (
                      <UI.FormControl.Select.Item key={version} value={version}>
                        {version === currentEdition ? t("editionCurrentOption", { version }) : version}
                      </UI.FormControl.Select.Item>
                    ))}
                  </UI.FormControl.Select.Content>
                </UI.FormControl.Select.Root>
                <ExportCsvButton
                  filename={journalCsvName(mode)}
                  onExport={props.onExport}
                  disabled={!data || total === 0}
                  testid="journal-export-csv"
                />
              </>
            }
            count={!props.error && !loading && rows.length > 0 ? { shown: rows.length, total } : undefined}
            notice={
              mode.kind !== "all" ? (
                <UI.Text
                  as="p"
                  size="sm"
                  variant="muted"
                  data-testid="journal-active-filter"
                  data-mode={mode.kind === "current" ? "bucket" : "edition"}
                >
                  <UI.Text as="span" size="sm" weight="medium" className="text-foreground">
                    {mode.kind === "current"
                      ? t("modeCurrent", { version: mode.version })
                      : t("modeEdition", { version: mode.version })}
                  </UI.Text>
                  {" · "}
                  {mode.kind === "current"
                    ? t("modeCurrentHint", { version: mode.version })
                    : t("modeEditionHint")}
                </UI.Text>
              ) : undefined
            }
            body={
              props.error ? (
                <JournalError onRetry={props.onRetry} />
              ) : loading ? (
                <JournalLoading />
              ) : rows.length === 0 ? (
                <JournalEmpty filtered={filtered} onReset={props.onReset} />
              ) : undefined
            }
            paging={{
              mode: "server",
              pageIndex: props.page - 1,
              pageSize: JOURNAL_PAGE_SIZE,
              total,
              pageCount,
              onPageChange: (index) => props.onPageChange(index + 1),
            }}
            emptyMessage={t("emptyFilteredTitle")}
            errorMessage={t("errorTitle")}
            toolbarTestId="journal-toolbar"
            countTestId="journal-count"
            tableTestId="journal-table"
            cardsTestId="journal-cards"
            cardAttributes={(a) => ({ "data-testid": "journal-card", "data-acceptance": a.id })}
          />
        )}
      </UI.Box>
    </UI.Tooltip.Provider>
  );
}

/**
 * «How many people on which edition». A bucket is a mode of the list
 * («Currently on X»), not the toolbar's Select («Edition X»): the two exclude
 * each other and the line above the list names the active one. An empty
 * bucket is disabled; «Never accepted» is not a button — such people have no
 * rows in the journal.
 */
function EditionSummary({
  summary,
  failed,
  currentEdition,
  value,
  onChange,
}: {
  summary: PolicyEditionSummary | undefined;
  failed: boolean;
  currentEdition: string | null;
  value: string;
  onChange: (version: string) => void;
}) {
  const t = useTranslations("policyAcceptances");
  return (
    <UI.Box
      direction="column"
      gap={2}
      className="rounded-lg border border-border p-3"
      data-testid="journal-summary"
      data-total={summary?.total_users}
    >
      {summary ? (
        <>
          <UI.Text as="span" size="sm" variant="muted">
            {t("summaryTitle", { total: summary.total_users })}
          </UI.Text>
          <UI.Box direction="row" align="center" gap={3} wrap>
            {summary.editions.length > 0 ? (
              <UI.ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={value}
                onValueChange={(next: string) => onChange(next)}
                aria-label={t("summaryAria")}
                className="w-auto max-w-full flex-wrap"
              >
                {summary.editions.map(({ version, users }) => {
                  const status = editionStatus(version, currentEdition);
                  return (
                    <UI.ToggleGroup.Item
                      key={version}
                      value={version}
                      className="gap-2"
                      data-testid="journal-summary-edition"
                      data-edition={version}
                      data-count={users}
                      disabled={users === 0}
                    >
                      <span className="font-mono tabular-nums">{version}</span>
                      <span className="tabular-nums font-semibold">{users}</span>
                      {status === "current" ? (
                        <UI.Badge variant="secondary">{t("current")}</UI.Badge>
                      ) : status === "outdated" ? (
                        <UI.Badge variant="outline">{t("outdated")}</UI.Badge>
                      ) : null}
                    </UI.ToggleGroup.Item>
                  );
                })}
              </UI.ToggleGroup>
            ) : null}
            <UI.Text
              as="span"
              size="sm"
              variant="muted"
              data-testid="journal-summary-never"
              data-count={summary.never_accepted}
            >
              {t("neverAccepted")}:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {summary.never_accepted}
              </span>
            </UI.Text>
          </UI.Box>
        </>
      ) : failed ? (
        <UI.Text as="span" size="sm" variant="muted" data-testid="journal-summary-error">
          {t("summaryError")}
        </UI.Text>
      ) : (
        <UI.Box direction="column" gap={2} data-testid="journal-summary-loading">
          <UI.Skeleton height={16} width={220} />
          <UI.Skeleton height={32} width="full" />
        </UI.Box>
      )}
    </UI.Box>
  );
}

function JournalLoading() {
  return (
    <UI.Box direction="column" gap={2} data-testid="journal-loading">
      {Array.from({ length: 6 }, (_, i) => (
        <UI.Skeleton key={i} height={44} width="full" />
      ))}
    </UI.Box>
  );
}

function JournalError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("policyAcceptances");
  return (
    <UI.Card fullWidth>
      <UI.EmptyState paddingY={10} data-testid="journal-error">
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <AlertTriangle size={40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center" className="max-w-md">
            <UI.Text as="h2" size="lg" weight="semibold" className="text-foreground">
              {t("errorTitle")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {t("errorText")}
            </UI.Text>
          </UI.Box>
          <UI.Button
            variant="outline"
            onClick={onRetry}
            className="text-foreground"
            data-testid="journal-retry"
          >
            {t("retry")}
          </UI.Button>
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

/**
 * Two different «nothing»: nothing matches the filters (fixed by clearing
 * them) and nobody has accepted the rules on this contour yet (nothing to fix).
 */
function JournalEmpty({ onReset, filtered }: { onReset: () => void; filtered: boolean }) {
  const t = useTranslations("policyAcceptances");
  return (
    <UI.Card fullWidth>
      <UI.EmptyState paddingY={10} data-testid="journal-empty" data-filtered={filtered}>
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <SearchX size={40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center" className="max-w-md">
            <UI.Text as="h2" size="lg" weight="semibold" className="text-foreground">
              {filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {filtered ? t("emptyFilteredText") : t("emptyText")}
            </UI.Text>
          </UI.Box>
          {filtered ? (
            <UI.Button
              variant="outline"
              onClick={onReset}
              className="text-foreground"
              data-testid="journal-reset"
            >
              {t("clearFilters")}
            </UI.Button>
          ) : null}
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}
