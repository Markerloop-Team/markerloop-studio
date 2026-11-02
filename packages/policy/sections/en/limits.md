# Limits

The Free plan applies per workspace. There are no paid plans yet, so a limit is the boundary of free use, not something you are billed for.

| What | How much |
|---|---|
| Free workspaces per account | {{limit:free_workspaces_per_user}} |
| Workspaces per account in total | {{limit:workspaces_per_user}} |
| Addresses (routes) in a workspace | {{limit:routes_per_workspace}} |
| Collections in a workspace | {{limit:collections_per_workspace}} |
| Records across all collections of a workspace | {{limit:records_per_workspace}} |
| Size of one record | {{limit:record_max_size}} |
| Total size of all collections of a workspace | {{limit:collections_total_size}} |
| Files in a workspace | {{limit:files_per_workspace}} |
| Total size of the files of a workspace | {{limit:files_total_size}} |
| Size of one file | {{limit:file_max_size}} |
| Site traffic per calendar month | {{limit:traffic_per_month}}, a guideline |

## Records from visitors

Visitors to your site can add records through forms, but the last {{limit:visitor_reserve_percent}} of the record limit is not available to them: that reserve stays with you.

## Traffic

{{limit:traffic_per_month}} per month is a guideline, not a cut-off. Your site keeps being served.

## What happens at a limit

- Writing stops: once a limit is reached, you cannot create a new address, collection, record or file.
- Reading, deleting and the published site keep working. No data is lost.
