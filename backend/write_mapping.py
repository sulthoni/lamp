"""
Module for writing mapping results to files.
"""
from interface import MappingProperties
from typing import List
import json
import os
import uuid
import re


def write_mapping_file(mapping_data: List[MappingProperties], ontology_file_path: str, filename='mapping_results.ttl', isDataSourceCSV=False):
    """
    Write R2RML mapping file based on mapping data and ontology file.
    """
    try:
        # Read the ontology file to extract prefixes
        prefixes = {}
        base_uri = ""

        with open(ontology_file_path, 'r', encoding='utf-8') as f:
            ontology_content = f.readlines()

        # Extract prefixes and base URI from ontology file
        for line in ontology_content:
            line = line.strip()
            if line.startswith('@prefix'):
                # Use regex to extract prefix and URI: @prefix prefix: <uri> .
                match = re.match(r'@prefix\s+(\w+):\s+<([^>]+)>', line)
                if match:
                    prefix_name = match.group(1)
                    uri = match.group(2)
                    prefixes[prefix_name] = uri
            elif line.startswith('@base'):
                # Use regex to extract base URI: @base <uri> .
                match = re.match(r'@base\s+<([^>]+)>', line)
                if match:
                    base_uri = match.group(1)
        # Add prefix for xsd
        # prefixes['xsd'] = "http://www.w3.org/2001/XMLSchema#"

        # If no base URI found, use a default one
        if not base_uri:
            base_uri = "http://example.com/"

        # Start writing the R2RML file
        r2rml_content = ''

        # Write prefixes
        for prefix, uri in prefixes.items():
            r2rml_content += f"@prefix {prefix}: <{uri}> .\n"

        # Add R2RML prefix if not already present
        if 'rr' not in prefixes:
            r2rml_content += "@prefix rr: <http://www.w3.org/ns/r2rml#> .\n"

        # Add prefix for base URI
        r2rml_content += f"@prefix : <{base_uri}> .\n"

        # Add additional prefixes if data source is CSV
        if isDataSourceCSV:
            r2rml_content += "@prefix rml: <http://semweb.mmlab.be/ns/rml#> .\n"
            r2rml_content += "@prefix ql: <http://semweb.mmlab.be/ns/ql#> .\n"

        # Add base
        r2rml_content += f"@base <{base_uri}> .\n"
        r2rml_content += "\n"

        # Process each mapping
        for i, mapping in enumerate(mapping_data):
            table_name = mapping.table_name
            improved_table_name = mapping.improved_table_name
            suggested_class = mapping.suggestedClass
            suggested_class_iri = mapping.suggestedClassIRI

            # Replace spaces with underscores in suggested_class
            suggested_class_formatted = suggested_class.replace(' ', '_')

            # Find the ID column (look for columns with 'id' in the name or first column as fallback)
            id_column = None
            for column in mapping.columns:
                if 'id' in column.column_name.lower():
                    id_column = column.column_name
                    break

            # If no ID Column found (look for columns with 'name' in the name or first column as fallback)
            if not id_column and mapping.columns:
                for column in mapping.columns:
                    if 'name' in column.column_name.lower():
                        id_column = column.column_name
                        break

            # If no ID column found, use the first column or 'id' as default
            if not id_column and mapping.columns:
                id_column = mapping.columns[0].column_name
            elif not id_column:
                id_column = "id"

            # Write logical table
            r2rml_content += f"<#LogicalTable_{table_name}_{suggested_class_formatted}>\n"
            if isDataSourceCSV:
                r2rml_content += f'  rml:logicalSource [ rml:source "{table_name}.csv" ; rml:referenceFormulation ql:CSV ] ;'
            else:
                r2rml_content += f'  rr:logicalTable [ rr:tableName "{table_name}" ] ;'
            r2rml_content += "\n\n"

            # Write subject map
            r2rml_content += "  rr:subjectMap [\n"
            r2rml_content += f'    rr:template "{base_uri}{suggested_class_formatted}/{table_name}/{{{id_column}}}" ;\n'

            # Use the suggested class IRI if available, otherwise use the class name
            if suggested_class_iri:
                r2rml_content += f"    rr:class <{suggested_class_iri}>\n"
            else:
                r2rml_content += f"    rr:class :{suggested_class}\n"
            r2rml_content += "  ] ;"
            r2rml_content += "\n\n"

            # Write predicate-object maps for each LLM suggestion
            for j, llm_result in enumerate(mapping.llmPropertiesSuggestionResult):
                column_name = llm_result.column_name
                properties = llm_result.properties
                prop_type = llm_result.type  # "data" or "object"

                # Find corresponding data type from DataProperties
                data_type = "string"  # default
                for data_prop in mapping.data_properties:
                    if data_prop.name == properties:
                        # Extract XSD datatype from URI or use direct type
                        if data_prop.uriDataType:
                            if '#' in data_prop.uriDataType:
                                data_type = data_prop.uriDataType.split('#')[-1]
                            elif '/' in data_prop.uriDataType:
                                data_type = data_prop.uriDataType.split('/')[-1]
                            else:
                                data_type = data_prop.dataType or "string"
                        else:
                            data_type = data_prop.dataType or "string"
                        break

                # Find corresponding range class from ObjectProperties if it's an object property
                range_class = None
                if prop_type == "object":
                    for obj_prop in mapping.object_properties:
                        if obj_prop.name == properties:
                            range_class = obj_prop.range
                            break

                # Write predicate-object map
                r2rml_content += "  rr:predicateObjectMap [\n"

                # Handle property prefix (check if it contains a colon for prefix:property format)
                if ':' in properties:
                    r2rml_content += f"    rr:predicate {properties} ;\n"
                else:
                    r2rml_content += f"    rr:predicate :{properties} ;\n"

                # Write object map based on type
                if prop_type == "data":
                    r2rml_content += "    rr:objectMap [\n"
                    if isDataSourceCSV:
                        r2rml_content += f'      rml:reference "{column_name}" ;\n'
                    else:
                        r2rml_content += f'      rr:column "{column_name}" ;\n'
                    r2rml_content += f"      rr:datatype xsd:{data_type}\n"
                    r2rml_content += "    ]"
                else:  # object property
                    # For object properties, create a template or reference
                    r2rml_content += "    rr:objectMap [\n"
                    r2rml_content += f'      rr:template "{base_uri}{range_class}/{{{column_name}}}" ;\n'
                    # Find the range class from ObjectProperties
                    for obj_prop in mapping.object_properties:
                        if obj_prop.name == properties:
                            if obj_prop.uriRange:
                                r2rml_content += f"      rr:class <{obj_prop.uriRange}>\n"
                            else:
                                r2rml_content += f"      rr:class :{obj_prop.range}\n"
                            break
                    r2rml_content += "    ]\n"

                # Add closing bracket and semicolon (except for the last one)
                if j < len(mapping.llmPropertiesSuggestionResult) - 1:
                    r2rml_content += "  ] ;"
                else:
                    r2rml_content += "  ] ."
                r2rml_content += "\n\n"

            # Add extra spacing between mappings
            if i < len(mapping_data) - 1:
                r2rml_content += "\n"

        # Write the R2RML content to file
        output_file = f"./data/{filename}"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(r2rml_content.strip())
        print(f"R2RML mapping file written successfully to {output_file}")

        # Validate the generated R2RML file
        validation_result = validate_r2rml_file(f"./data/{filename}")
        print(validation_result)

        return r2rml_content, output_file

    except Exception as e:
        print(f"Error writing mapping file: {e}")
        raise e


def validate_r2rml_file(r2rml_file_path: str) -> dict:
    """
    Validate the generated R2RML mapping file using rdflib.
    Returns a dictionary with validation status and messages.
    """
    try:
        from rdflib import Graph, Namespace
        from rdflib.exceptions import ParserError
        import os

        if not os.path.exists(r2rml_file_path):
            return {"valid": False, "message": f"File not found: {r2rml_file_path}"}

        try:
            # Create a new RDF graph
            g = Graph()

            # Parse the R2RML file (Turtle format)
            g.parse(r2rml_file_path, format="turtle")

            # Define R2RML namespace
            RR = Namespace("http://www.w3.org/ns/r2rml#")

            # Basic R2RML validation checks
            triples_maps = list(g.subjects(RR.logicalTable, None))

            if not triples_maps:
                return {
                    "valid": False,
                    "message": "No R2RML triples maps found. File may not be a valid R2RML mapping."
                }

            return {
                "valid": True,
                "message": "R2RML file is syntactically valid.",
                "triples_maps_count": len(triples_maps),
                "total_triples": len(g)
            }

        except ParserError as parse_err:
            return {
                "valid": False,
                "message": f"R2RML parsing error: {str(parse_err)}"
            }
        except Exception as e:
            return {
                "valid": False,
                "message": f"R2RML validation error: {str(e)}"
            }

    except ImportError as import_err:
        return {
            "valid": False,
            "message": f"Required library not available: {str(import_err)}"
        }
    except Exception as e:
        return {
            "valid": False,
            "message": f"Unexpected error during validation: {str(e)}"
        }


def write_mapping_route_logic(request_data, request_files, content_type):
    """
    Handle write mapping logic - moved from Flask route
    """
    from interface import MappingProperties, DataProperties, ObjectProperties, Column, LLMPropertiesSuggestionResult

    # Validate and process the incoming mapping data
    try:
        ontology_file_path = None

        # Handle multipart/form-data (for file upload)
        if content_type.startswith('multipart/form-data'):
            mapping_data_str = request_data.get('mappingData')
            isDataSourceCSV = request_data.get('isDataSourceCSV', False)
            if not mapping_data_str:
                return {'error': 'mappingData is required in form data.'}, 400
            data = json.loads(mapping_data_str)

            # Handle ontologyFile upload
            ontology_file = request_files.get('ontologyFile')
            if ontology_file:
                # Save the uploaded file to /data/temp/ with a unique name
                temp_folder = './data/temp/'
                os.makedirs(temp_folder, exist_ok=True)
                filename = f"ontology_{uuid.uuid4().hex}.ttl"
                ontology_file_path = os.path.join(temp_folder, filename)
                ontology_file.save(ontology_file_path)
            else:
                return {'error': 'ontologyFile is required in form data.'}, 400

        elif content_type == 'application/json':
            data = request_data
            if not data:
                return {'error': 'JSON mapping data is required.'}, 400
            # For JSON, expect ontologyFilePath as a string path
            ontology_file_path = data.get('ontologyFilePath')
            if not ontology_file_path:
                return {'error': 'ontologyFilePath is required in JSON.'}, 400
        else:
            return {'error': 'Content-Type must be multipart/form-data or application/json'}, 415

        mappings = []
        for mapping_data in data:
            mapping = MappingProperties(
                table_name=mapping_data['table_name'],
                improved_table_name=mapping_data['improved_table_name'],
                suggestedClass=mapping_data['suggestedClass'],
                suggestedClassIRI=mapping_data['suggestedClassIRI'],
                selected=mapping_data['selected'],
                data_properties=[DataProperties(**dp) for dp in mapping_data['dataProperties']],
                object_properties=[ObjectProperties(**op) for op in mapping_data['objectProperties']],
                columns=[Column(**col) for col in mapping_data['columns']],
                llmPropertiesSuggestionResult=[LLMPropertiesSuggestionResult(**llm) for llm in mapping_data['llmPropertiesSuggestionResult']]
            )
            mappings.append(mapping)

        # Call write_mapping_file with both mapping data and ontology file path
        result, output_file_path = write_mapping_file(mappings, ontology_file_path, 'generated_mapping.ttl', isDataSourceCSV)

        # Write the result to a file in /data/temp/
        output_dir = './data/temp/'
        os.makedirs(output_dir, exist_ok=True)
        output_filename = f"mapping_result_{uuid.uuid4().hex}.ttl"
        output_path = os.path.join(output_dir, output_filename)
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2)

        return {
            'message': 'Mapping data and ontology file received and processed successfully',
            'ontology_file': ontology_file_path,
            'result': result
        }, 200

    except Exception as e:
        return {'error': str(e)}, 400

