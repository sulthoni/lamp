"""
Ablation study module: Single LLM call for the ENTIRE data source.

Replaces the two-step, per-table pipeline:
  Step 1 (select_concept)    – table  → ontology classes
  Step 2 (select_properties) – column → ontology properties

With ONE prompt that receives ALL tables + columns and returns BOTH class and
property mappings in a single structured response.

API compatibility
-----------------
- Input  : identical to /api/llm-select-concepts   (selectionDataTable + globalSchemaSummary)
- Output : covers both /api/llm-select-concepts     (results_table)
                  and  /api/llm-suggest-properties  (results per table)
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate

from interface import (
    AblationFullMappingResult,
    Candidate,
    SimilarConcept,
)
from langchain_config import langchain_manager
from prompt_logger import append_prompt_log, format_prompt_log, init_prompt_log

# ---------------------------------------------------------------------------
# LangChain chain
# ---------------------------------------------------------------------------

class CombinedMappingChain:
    """
    Single-prompt chain that maps ALL tables and ALL columns to ontology
    classes and properties in one LLM call.
    """

    def __init__(self) -> None:
        self.llm = langchain_manager.get_llm()
        self.config = langchain_manager.config
        self.parser = PydanticOutputParser(pydantic_object=AblationFullMappingResult)
        self._setup_prompt()
        self.chain = self.prompt | self.llm | self.parser

    # ------------------------------------------------------------------
    # Prompt
    # ------------------------------------------------------------------

    def _setup_prompt(self) -> None:
        self.prompt = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and ontology-based data integration (OBDI).
                You specialise in schema alignment between relational database schemas and OWL/RDF ontologies.

            Goal:
                In a **single pass**, map **every table and every column** in the provided data source
                to their most semantically appropriate ontology class(es) and property(ies).

                You must reason both locally (per table) and globally (across the whole schema) to produce
                a coherent, non-redundant, and complete mapping.

            ═══════════════════════════════════════════════════════════════
            SECTION A — GLOBAL INPUTS
            ═══════════════════════════════════════════════════════════════

            Base URI:
                {base_uri}

            Global Schema Summary (tables, columns, PK/FK relationships, ontology overview):
                {global_schema_summary}

            All Tables with Candidate Ontology Classes:
                {all_tables_candidates_text}

            ═══════════════════════════════════════════════════════════════
            SECTION B — REASONING PROCESS  (follow every step)
            ═══════════════════════════════════════════════════════════════

            For the schema AS A WHOLE, then for EACH TABLE, apply the steps below.

            ── Schema-level pre-analysis ──────────────────────────────────
            B0. Global Awareness
                • Study the Global Schema Summary.
                • Identify all PK/FK relationships across tables.
                • Note which tables are join/association tables (composite PKs, mostly FKs).
                • Map out the high-level entity graph before touching individual tables.
                • Keep a running "already-mapped" registry to avoid duplicating class or
                  property assignments.

            ── Per-table analysis ────────────────────────────────────────
            B1. Data-Model Signals
                • Infer PK(s) and FK(s) for the table from column names and the global schema.
                • Detect whether the table is a join table (composite PK, two+ FKs, few or no
                  non-key columns).

            B2. Column Clustering
                • Group columns by semantic theme
                  (e.g., personal_info, financial_info, reference_info).
                • Label each cluster. List its columns.
                • Link each cluster to the most plausible candidate ontology class.

            B3. Class-Mapping Logic
                • Decide: single-class or multi-class mapping?
                • For multi-class: identify bridge/FK columns that connect the classes.
                • Ensure the chosen mapping is consistent with choices made for related tables
                  (global consistency check).

            B4. Candidate Analysis
                For each candidate ontology class provided for the table:
                • Semantic label match against the table name / improved name.
                • Alignment of data properties with non-FK columns.
                • Alignment of object properties with FK columns.
                • Cosine similarity score is a prior — override it with semantic evidence when needed.

            B5. Class URI Construction
                • For each selected class, choose ONE identifier column (prefer the true PK).
                • Construct the URI:  <base_uri>/<ClassLabel>/<id_column_name>

            B6. Property Mapping  (for every non-PK-identity column)
                • FK / reference columns  → object properties.
                  Validate domain–range alignment with the ontology.
                • Descriptive / attribute columns → data properties.
                  Assign to the class whose semantic cluster contains the column.
                • If no suitable existing property exists → set new_property = true and propose a name.
                • Composite mappings: if one ontology property covers multiple columns
                  (e.g., fullName = firstName + lastName), note it in the reason.
                • Primary-key-only identity columns (auto-increment IDs with no FK role) → SKIP.

            B7. Global Validation (after mapping all tables)
                • No two tables should map to ontology classes with incompatible relationships.
                • FK links between tables must align with ontology object properties.
                • No property mapped in a previous table should be duplicated for the same
                  class unless semantically justified.
                • Confirm total column coverage (every non-PK-identity column has a mapping).

            ═══════════════════════════════════════════════════════════════
            SECTION C — OUTPUT FORMAT
            ═══════════════════════════════════════════════════════════════

            {format_instructions}

            Additional formatting rules
            • Return ONLY valid JSON — no prose, markdown fences, or comments outside the JSON.
            • Output one AblationTableMapping entry per table, in the same order as the input.
            • Each AblationClassMapping must include its own property_mappings list
              (only for columns that belong to that class).
            • confidence_score must be a float 0.00–1.00 (two-decimal precision).
            • class_uri must follow exactly:  <base_uri>/<ClassLabel>/<id_column_name>
            • If a table has no suitable class candidate, return an empty class_mappings list
              and explain in a reason field on the table entry.

            ═══════════════════════════════════════════════════════════════
            SECTION D — FINAL INSTRUCTIONS
            ═══════════════════════════════════════════════════════════════

            • Process ALL tables — do not skip any.
            • Be globally coherent: decisions for one table must not contradict decisions for another.
            • Prefer existing ontology properties over proposing new ones (new_property = true is
              a last resort).
            • Every reason must reference at least:
                - PK/FK evidence
                - Column cluster(s)
                - Candidate property alignment
                - Global schema consistency note
            """
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_all_tables_candidates(all_candidates: List[Dict[str, Any]]) -> str:
        """
        Render all tables + their candidate classes into a readable prompt block.

        all_candidates: list of items produced by _convert_to_candidate_objects(),
        each being a Candidate (term, candidates: List[SimilarConcept]).
        """
        blocks: List[str] = []
        for idx, candidate in enumerate(all_candidates, 1):
            lines = [
                f"--- Table {idx}: {candidate.term} ---",
            ]
            for c_idx, concept in enumerate(candidate.candidates, 1):
                lines += [
                    f"  Candidate {c_idx}:",
                    f"    Label         : {concept.label}",
                    f"    ID/URI        : {concept.id}",
                    f"    Description   : {concept.description}",
                    f"    Explanatory   : {concept.explanatory_text}",
                    f"    Synonyms      : {', '.join(concept.synonyms) if concept.synonyms else 'None'}",
                    f"    Similarity    : {concept.similarity:.4f}",
                    f"    Data Props    : {json.dumps(concept.data_properties) if concept.data_properties else 'None'}",
                    f"    Object Props  : {json.dumps(concept.object_properties) if concept.object_properties else 'None'}",
                ]
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks)

    # ------------------------------------------------------------------
    # Main entry
    # ------------------------------------------------------------------

    def run(
        self,
        all_candidates: List[Candidate],
        global_schema_summary: str,
        base_uri: str = "http://example.com/",
        provider: str | None = None,
    ) -> AblationFullMappingResult:
        provider = provider or self.config.LLM_PROVIDER
        model = self.config.LLM_MODEL
        langchain_manager.rate_limit_check(provider, embeddings=False)

        all_tables_candidates_text = self._format_all_tables_candidates(all_candidates)

        prompt_input: Dict[str, Any] = {
            "base_uri": base_uri,
            "global_schema_summary": global_schema_summary,
            "all_tables_candidates_text": all_tables_candidates_text,
            "format_instructions": self.parser.get_format_instructions(),
        }

        # Render prompt for logging
        formatted_prompt = self.prompt.format_messages(**prompt_input)
        prompt_text = "\n".join([m.content for m in formatted_prompt])

        result: AblationFullMappingResult = self.chain.invoke(prompt_input)

        # Prompt logging
        log_file = "./data/prompt_log_ablation_combined.txt"
        log_entry = format_prompt_log(
            process_name="AblationCombinedMapping - Full Schema",
            step=1,
            total_steps=1,
            prompt_input={k: v for k, v in prompt_input.items() if k != "format_instructions"},
            prompt_text=prompt_text,
            response=result,
            provider=provider,
            model=model,
            extra_info={
                "table_count": len(all_candidates),
                "mode": "ablation_single_prompt_full_schema",
            },
        )
        append_prompt_log(log_file, log_entry)

        return result


# ---------------------------------------------------------------------------
# Output normalisation helpers
# ---------------------------------------------------------------------------

def _build_select_concepts_output(
    result: AblationFullMappingResult,
    all_candidates: List[Candidate],
) -> List[Dict[str, Any]]:
    """
    Produce a results_table list that is 100 % compatible with the output of
    select_concept.llm_select_concepts_logic()  →  key 'results_table'.

    Shape per entry (mirrors _format_selection_results_table):
    {
        term, selected_candidates, selected_candidate_URIs,
        confidence_scores, class_uris, reasons,
        columns,         # List[List[str]]
        related_columns  # List[List[str]]
    }
    """
    # Build a quick look-up: table_name → Candidate
    candidate_map: Dict[str, Candidate] = {c.term: c for c in all_candidates}

    formatted: List[Dict[str, Any]] = []
    for tm in result.table_mappings:
        term = tm.table_name

        selected_candidates: List[str] = []
        class_uris: List[str] = []
        confidence_scores: List[float] = []
        reasons: List[str] = []
        columns: List[List[str]] = []
        related_columns: List[List[str]] = []

        for cm in tm.class_mappings:
            selected_candidates.append(cm.class_name)
            class_uris.append(cm.class_uri)
            confidence_scores.append(cm.confidence_score)
            reasons.append(cm.reason)
            columns.append(cm.suggested_columns)
            related_columns.append(cm.related_columns)

        formatted.append(
            {
                "term": term,
                "selected_candidates": selected_candidates,
                "selected_candidate_URIs": class_uris,
                "confidence_scores": confidence_scores,
                "class_uris": class_uris,
                "reasons": reasons,
                "columns": columns,
                "related_columns": related_columns,
            }
        )

    return formatted


def _build_suggest_properties_output(
    result: AblationFullMappingResult,
) -> List[Dict[str, Any]]:
    """
    Produce a per-table results list compatible with the output of
    select_properties.llm_suggest_properties_logic()  →  key 'results'.

    Top level: list of per-table dicts, each with:
    {
        message, success, log,
        results: [
            { table_name, column_name, class_name, properties, type, new_property }
            ...
        ]
    }
    """
    per_table: List[Dict[str, Any]] = []

    for tm in result.table_mappings:
        table_name = tm.table_name
        mappings: List[Dict[str, Any]] = []

        for cm in tm.class_mappings:
            for pm in cm.property_mappings:
                mappings.append(
                    {
                        "table_name": table_name,
                        "column_name": pm.column_name,
                        "class_name": pm.class_name,
                        "properties": pm.properties,
                        "type": pm.type,
                        "new_property": pm.new_property,
                    }
                )

        log_lines = [f"[Ablation] Property mappings for table '{table_name}':"]
        for m in mappings:
            log_lines.append(
                f"  {m['column_name']} → {m['class_name']}.{m['properties']} "
                f"[{m['type']}] new={m['new_property']}"
            )
        log = "\n".join(log_lines)

        per_table.append(
            {
                "message": f"Ablation combined mapping for table '{table_name}'",
                "success": True,
                "log": log,
                "results": mappings,
            }
        )

    return per_table


def _build_global_schema_with_mappings(
    global_schema_summary: Dict[str, Any],
    property_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Mirror the logic of select_properties._update_global_schema_with_mappings."""
    if "previous_mappings" not in global_schema_summary:
        global_schema_summary["previous_mappings"] = []

    for table_entry in property_results:
        table_name = table_entry.get("results", [{}])[0].get("table_name", "") if table_entry.get("results") else ""
        if not table_name:
            continue

        new_table_map: Dict[str, str] = {}
        for m in table_entry.get("results", []):
            col_key = f"{m['table_name']}.{m['column_name']}"
            new_table_map[col_key] = f"{m['class_name']}.{m['properties']}"

        prev = global_schema_summary["previous_mappings"]
        if isinstance(prev, list):
            updated = False
            for entry in prev:
                if isinstance(entry, dict) and table_name in entry:
                    entry[table_name].update(new_table_map)
                    updated = True
                    break
            if not updated:
                prev.append({table_name: new_table_map})
        elif isinstance(prev, dict):
            prev[table_name] = new_table_map

    return global_schema_summary


def _generate_full_log(
    result: AblationFullMappingResult,
    concepts_output: List[Dict[str, Any]],
    properties_output: List[Dict[str, Any]],
) -> str:
    lines = [
        "=" * 70,
        "ABLATION STUDY — Combined Full-Schema Mapping",
        f"Tables processed : {len(result.table_mappings)}",
        "=" * 70,
    ]
    for tm in result.table_mappings:
        lines += [
            "",
            f"Table : {tm.table_name}  (improved: {tm.improved_table_name})",
            f"  Classes found : {len(tm.class_mappings)}",
        ]
        for cm in tm.class_mappings:
            lines += [
                f"  ├─ Class     : {cm.class_name}",
                f"  │  URI       : {cm.class_uri}",
                f"  │  Confidence: {cm.confidence_score}",
                f"  │  Columns   : {cm.suggested_columns}",
                f"  │  FK cols   : {cm.related_columns}",
                f"  │  Reason    : {cm.reason[:120]}...",
                f"  │  Properties: {len(cm.property_mappings)} mapped",
            ]
            for pm in cm.property_mappings:
                lines.append(
                    f"  │    {pm.column_name} → {pm.properties} [{pm.type}] new={pm.new_property}"
                )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Candidate conversion (same as select_concept._convert_to_candidate_objects)
# ---------------------------------------------------------------------------

def _convert_to_candidate_objects(candidates_data: List[Dict]) -> List[Candidate]:
    candidates: List[Candidate] = []
    for item in candidates_data:
        similar_concepts = [
            SimilarConcept(
                id=c.get("id", ""),
                label=c.get("label", ""),
                description=c.get("description", ""),
                explanatory_text=c.get("explanatory_text", ""),
                synonyms=c.get("synonyms", []),
                similarity=float(c.get("similarity", 0.0)),
                data_properties=c.get("data_properties", []),
                object_properties=c.get("object_properties", []),
            )
            for c in item.get("candidates", [])
        ]
        candidates.append(Candidate(term=item.get("term", ""), candidates=similar_concepts))
    return candidates


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def llm_combined_full_mapping_logic(
    selection_table_json: List[Dict[str, Any]],
    global_schema_summary: Dict[str, Any],
    base_uri: str = "http://example.com/",
) -> Dict[str, Any]:
    """
    Single entry point that replaces BOTH:
      - select_concept.llm_select_concepts_logic()
      - select_properties.llm_suggest_properties_logic()

    Parameters
    ----------
    selection_table_json   : same payload as `selectionDataTable` sent to /api/llm-select-concepts
    global_schema_summary  : same payload as `globalSchemaSummary`
    base_uri               : ontology base URI (default: http://example.com/)

    Returns
    -------
    {
        message            : str
        success            : bool
        total_processed    : int
        log                : str
        results            : []          ← empty (row-level, kept for compat)
        results_table      : List[Dict]  ← compatible with /api/llm-select-concepts output
        property_results   : List[Dict]  ← compatible with /api/llm-suggest-properties output
        global_schema_summary : Dict
    }
    """
    chain = CombinedMappingChain()
    provider = chain.config.LLM_PROVIDER
    model = chain.config.LLM_MODEL

    # File paths
    result_file = "./data/llm_ablation_full_mapping.json"
    log_file = "./data/llm_ablation_full_mapping_log.txt"
    prompt_log_file = "./data/prompt_log_ablation_combined.txt"

    init_prompt_log(
        prompt_log_file,
        process_name="Ablation Combined Full-Schema Mapping",
        metadata={"Provider": provider, "Model": model, "Tables": len(selection_table_json)},
    )

    # ------------------------------------------------------------------
    # Convert input
    # ------------------------------------------------------------------
    all_candidates = _convert_to_candidate_objects(selection_table_json)

    # ------------------------------------------------------------------
    # Cache check
    # ------------------------------------------------------------------
    if (
        os.path.exists(result_file) and os.path.getsize(result_file) > 0
        and os.path.exists(log_file) and os.path.getsize(log_file) > 0
    ):
        print("[Ablation] Using cached full-schema combined mapping.")
        try:
            with open(result_file, "r") as f:
                cached = json.load(f)
            with open(log_file, "r") as f:
                log = f.read()

            global_schema_summary = _build_global_schema_with_mappings(
                global_schema_summary, cached.get("property_results", [])
            )
            return {
                "message": "Used cached ablation full-schema mapping",
                "success": True,
                "total_processed": cached.get("total_processed", 0),
                "log": log,
                "results": [],
                "results_table": cached.get("results_table", []),
                "property_results": cached.get("property_results", []),
                "global_schema_summary": global_schema_summary,
            }
        except Exception as e:
            print(f"[Ablation] Cache read error: {e}. Re-running LLM.")

    # ------------------------------------------------------------------
    # Run LLM
    # ------------------------------------------------------------------
    global_schema_str = json.dumps(global_schema_summary, indent=2)

    print(f"[Ablation] Running combined full-schema mapping for {len(all_candidates)} tables …")
    try:
        result: AblationFullMappingResult = chain.run(
            all_candidates=all_candidates,
            global_schema_summary=global_schema_str,
            base_uri=base_uri,
            provider=provider,
        )
    except Exception as e:
        print(f"[Ablation] LLM error: {e}")
        return {"message": f"LLM error: {e}", "success": False}

    # ------------------------------------------------------------------
    # Normalise outputs
    # ------------------------------------------------------------------
    concepts_output = _build_select_concepts_output(result, all_candidates)
    properties_output = _build_suggest_properties_output(result)
    log = _generate_full_log(result, concepts_output, properties_output)

    # Update global schema
    global_schema_summary["previous_mappings"] = []
    global_schema_summary = _build_global_schema_with_mappings(global_schema_summary, properties_output)

    # ------------------------------------------------------------------
    # Persist
    # ------------------------------------------------------------------
    payload = {
        "total_processed": len(all_candidates),
        "results_table": concepts_output,
        "property_results": properties_output,
    }
    with open(result_file, "w") as f:
        json.dump(payload, f, indent=2)
    with open(log_file, "w") as f:
        f.write(log)

    return {
        "message": "Ablation combined full-schema mapping completed successfully",
        "success": True,
        "total_processed": len(all_candidates),
        "log": log,
        "results": [],                          # kept for API compat
        "results_table": concepts_output,       # → /api/llm-select-concepts consumers
        "property_results": properties_output,  # → /api/llm-suggest-properties consumers
        "global_schema_summary": global_schema_summary,
    }