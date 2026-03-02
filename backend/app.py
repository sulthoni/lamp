from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import getpass
import pyodbc
from typing import Dict, List
from rdflib import Graph
# from graphdb_client import GraphDBClient
from utils import Config, encode_text_gemini
from langchain_config import langchain_manager
from dotenv import load_dotenv
from connections import (
    load_connections,
    save_connections,
    get_mysql_connection,
    get_mssql_connection,
    test_mysql_connection,
    test_mssql_connection,
    get_sample_data_mysql,
    get_sample_data_mssql,
    get_foreign_keys_mysql,
    get_foreign_keys_mssql
)
from table_structure import (
    load_table_structure,
    save_table_structure,
    get_mysql_table_structure,
    get_mssql_table_structure
)
import save_embedding
import retrieve_candidates
import select_concept
import pre_processing
from interface import TermImprovement, Candidate, SimilarConcept
import time
import select_properties
import write_mapping
import select_combined_ablation          # ← add this import
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_chroma import Chroma

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 16 MB limit (adjust as needed)
CORS(app, origins="*")

config = langchain_manager.config

#### Handle Connections ####
@app.route('/api/connections', methods=['GET'])
def get_connections():
    connections = load_connections()
    # Remove password from response
    for conn in connections:
        conn.pop('password', None)
    return jsonify(connections)

@app.route('/api/connections', methods=['POST'])
def save_connection():
    connection = request.json
    connections = load_connections()

    # Generate simple ID
    connection['id'] = str(len(connections) + 1)
    connections.append(connection)
    save_connections(connections)

    return jsonify(connection)

@app.route('/api/connections/<connection_id>', methods=['PUT'])
def update_connection(connection_id):
    connection = request.json
    connections = load_connections()

    for i, conn in enumerate(connections):
        if conn['id'] == connection_id:
            connections[i] = connection
            save_connections(connections)
            return jsonify(connection)

    return jsonify({'error': 'Connection not found'}), 404

@app.route('/api/test-connection', methods=['POST'])
def test_connection():
    params = request.json
    print(params)
    try:
        if params['type'] == 'mysql':
            test_mysql_connection(params)
        elif params['type'] == 'mssql':
            test_mssql_connection(params)
        else:
            return jsonify({'error': 'Unsupported database type'}), 400

        return jsonify({'message': 'Connection successful'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

#### Handle Table Structures (Data Source) ####
@app.route('/api/table-structures/<connection_id>', methods=['GET'])
def get_table_structures(connection_id):
    print('api table structure: ' + str(connection_id))
    connections = load_connections()
    selected_connection = None

    for i, conn in enumerate(connections):
        if conn['id'] == connection_id:
            selected_connection = connections[i]
            break

    try:
        if selected_connection['type'] == 'mysql':
            table_structures = get_mysql_table_structure(selected_connection)
            print(jsonify(table_structures))
            return jsonify(table_structures)

        elif selected_connection['type'] == 'mssql':
            table_structures = get_mssql_table_structure(selected_connection)
            print(jsonify(table_structures))
            return jsonify(table_structures)

        else:
            return jsonify({'error': 'Unsupported database type'}), 400

    except Exception as err:
        return jsonify({'error': str(err)}), 500

@app.route('/api/table-structures', methods=['POST'])
def save_structure_table():
    try:
        table_structure = request.json
        print(table_structure)
        # Save and return the file as a response for download
        return save_table_structure(table_structure, config.TABLE_STRUCTURE_FILE)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/load-table-structure', methods=['GET'])
def load_structure_table():
    try:
        table_structure = load_table_structure(config.TABLE_STRUCTURE_FILE)
        return jsonify(table_structure)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/global-ontology', methods=['GET'])
def get_global_ontologies():
    if os.path.exists('./data/SDPOv1.1.ttl'):
        with open('./data/SDPOv1.1.ttl', 'r') as f:
            return f.read()
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/connections/<connection_id>/tables/<table_name>/sample', methods=['GET'])
def get_sample_data(connection_id, table_name):
    """API endpoint to get sample data from a specific table"""
    try:
        # Get limit parameter from query string (default: 10)
        limit = request.args.get('limit', 10, type=int)

        # Validate limit
        if limit <= 0 or limit > 1000:
            return jsonify({'error': 'Limit must be between 1 and 1000'}), 400

        # Find the connection
        connections = load_connections()
        selected_connection = None

        for conn in connections:
            if conn['id'] == connection_id:
                selected_connection = conn
                break

        if not selected_connection:
            return jsonify({'error': 'Connection not found'}), 404

        # Get sample data based on database type
        if selected_connection['type'] == 'mysql':
            sample_data = get_sample_data_mysql(selected_connection, table_name, limit)
        elif selected_connection['type'] == 'mssql':
            sample_data = get_sample_data_mssql(selected_connection, table_name, limit)
        else:
            return jsonify({'error': 'Unsupported database type'}), 400

        return jsonify(sample_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/connections/<connection_id>/tables/<table_name>/foreign-keys', methods=['GET'])
def get_foreign_keys(connection_id, table_name):
    """API endpoint to get foreign key information from a specific table"""
    try:
        # Find the connection
        connections = load_connections()
        selected_connection = None

        for conn in connections:
            if conn['id'] == connection_id:
                selected_connection = conn
                break

        if not selected_connection:
            return jsonify({'error': 'Connection not found'}), 404

        # Get foreign keys based on database type
        if selected_connection['type'] == 'mysql':
            foreign_keys = get_foreign_keys_mysql(selected_connection, table_name)
        elif selected_connection['type'] == 'mssql':
            foreign_keys = get_foreign_keys_mssql(selected_connection, table_name)
        else:
            return jsonify({'error': 'Unsupported database type'}), 400

        return jsonify(foreign_keys), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-to-chromadb', methods=['POST'])
def save_to_chromadb():
    try:
        # Check if the request is multipart/form-data
        if not request.content_type.startswith('multipart/form-data'):
            return jsonify({'error': 'Content-Type must be multipart/form-data'}), 415

        flatExportedSchemaJson_file = request.files.get('flatExportedSchemaJson')
        if not flatExportedSchemaJson_file:
            return jsonify({'error': 'flatExportedSchemaJson_file is required.'}), 400

        result = save_embedding.save_to_chromadb_route(flatExportedSchemaJson_file, config.COLLECTION_NAME)
        return jsonify(result), 200 if 'message' in result else 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chromadb-collections', methods=['GET'])
def get_collections():
    """API endpoint to get all ChromaDB collections"""
    try:
        result = save_embedding.get_chromadb_collections()
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/terms-suggestion', methods=['POST'])
def terms_suggestion():
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            terms_str = request.form.get('terms')
            tables_str = request.form.get('tables')
            if not terms_str or not tables_str:
                return jsonify({'error': 'terms and tables are required in form data.'}), 400
        elif request.content_type == 'application/json':
            # Get data from JSON body
            request_json = request.get_json()
            if not request_json:
                return jsonify({'error': 'JSON data is required.'}), 400

            terms_str = request_json.get('terms')
            tables_str = request_json.get('tables')

            # For JSON requests, convert to string if they're already objects
            if isinstance(terms_str, (dict, list)):
                terms_str = json.dumps(terms_str)
            if isinstance(tables_str, (dict, list)):
                tables_str = json.dumps(tables_str)

            if not terms_str or not tables_str:
                return jsonify({'error': 'terms and tables are required in JSON data.'}), 400
        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        result = pre_processing.terms_suggestion_logic(terms_str, tables_str)
        return jsonify(result), 200 if 'message' in result else 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-suggested-terms', methods=['GET'])
def check_suggested_terms():
    """API endpoint to check and get suggested_terms.txt content"""
    try:
        result = pre_processing.get_suggested_terms_file()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/embeddings-and-save-as-text-file', methods=['POST'])
def embedding_and_save_as_text_file():
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            embedding_json_str = request.form.get('sourceSchemaJson')
            embedding_table_json_str = request.form.get('sourceSchemaTableJson')
            if not embedding_json_str or not embedding_table_json_str:
                return jsonify({'error': 'sourceSchemaJson and sourceSchemaTableJson are required in form data.'}), 400
        elif request.content_type == 'application/json':
            # Get data from JSON body
            request_json = request.get_json()
            if not request_json:
                return jsonify({'error': 'JSON data is required.'}), 400

            embedding_json_str = request_json.get('sourceSchemaJson')
            embedding_table_json_str = request_json.get('sourceSchemaTableJson')

            # For JSON requests, convert to string if they're already objects
            if isinstance(embedding_json_str, (dict, list)):
                embedding_json_str = json.dumps(embedding_json_str)
            if isinstance(embedding_table_json_str, (dict, list)):
                embedding_table_json_str = json.dumps(embedding_table_json_str)

            if not embedding_json_str or not embedding_table_json_str:
                return jsonify({'error': 'sourceSchemaJson and sourceSchemaTableJson are required in JSON data.'}), 400

        result = pre_processing.embedding_and_save_as_text_file_logic(embedding_json_str, embedding_table_json_str, config.EMBEDDING_MODEL)
        return jsonify(result), 200 if 'message' in result else 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-embeddings', methods=['GET'])
def check_embeddings():
    """API endpoint to check and get embeddings.txt content"""
    try:
        result = pre_processing.get_embeddings_file()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/schema-summary', methods=['POST'])
def schema_summary():
    """API endpoint to get schema summary and save it to file"""
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            schema_data = request.form.get('tables')
            ontology_data = request.form.get('ontology')
            if not schema_data:
                return jsonify({'error': 'tables is required in form data.'}), 400
            schema_json = json.loads(schema_data)
            ontology_json = json.loads(ontology_data) if ontology_data else None
        elif request.content_type == 'application/json':
            # Get data from JSON body
            request_json = request.get_json()
            if not request_json:
                return jsonify({'error': 'JSON data is required.'}), 400
            schema_json = request_json.get('tables')
            ontology_json = request_json.get('ontology')
        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        # Save to file if successful
        if schema_json and ontology_json:
            schema_summary_file = config.SCHEMA_SUMMARY_FILE

            # Ensure data directory exists
            os.makedirs(os.path.dirname(schema_summary_file), exist_ok=True)

            # Save the schema summary to file
            with open(schema_summary_file, 'w', encoding='utf-8') as f:
                # Write the entire result as JSON
                json.dump(request_json, f, indent=2, ensure_ascii=False)

            print(f"Schema summary saved to {schema_summary_file}")

        return jsonify({'success': True, 'message': 'Global schema summary saved successfully', 'summary': request_json}), 200 if schema_json and ontology_json else 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/check-schema-summary', methods=['GET'])
def check_schema_summary():
    """API endpoint to check and get schema_summary.txt content"""
    try:
        schema_summary_file = config.SCHEMA_SUMMARY_FILE

        # Check if file exists
        if not os.path.exists(schema_summary_file):
            return jsonify({
                'success': False,
                'message': 'Global schema summary file not found. Please generate schema summary first.'
            }), 404

        # Check if file has content
        file_size = os.path.getsize(schema_summary_file)
        if file_size == 0:
            return jsonify({
                'success': False,
                'message': 'Global schema summary file is empty.'
            }), 200

        # Read and return file content
        with open(schema_summary_file, 'r', encoding='utf-8') as f:
            content = json.load(f)

        return jsonify({
            'success': True,
            'message': 'Schema summary file loaded successfully.',
            'summary': content
        }), 200

    except json.JSONDecodeError as e:
        return jsonify({
            'exists': True,
            'error': 'Invalid JSON format in file',
            'details': str(e)
        }), 500
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/retrieve-candidates', methods=['POST'])
def retrieve_candidates_route():
    """API endpoint to retrieve candidates using ChromaDB similarity search"""
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            query_data = request.form.get('queryData')
            if not query_data:
                return jsonify({'error': 'queryData is required in form data.'}), 400
            query_json = json.loads(query_data)
        elif request.content_type == 'application/json':
            # Get data from JSON body
            query_json = request.get_json()
            if not query_json:
                return jsonify({'error': 'JSON data is required.'}), 400
        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        # Extract parameters (with defaults)
        collection_name = query_json.get('collection_name', config.COLLECTION_NAME)

        result = retrieve_candidates.retrieve_candidates_logic(
            query_json, collection_name
        )

        if 'error' in result:
            return jsonify(result), 400
        else:
            return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/llm-select-concepts', methods=['POST'])
def llm_select_concepts():
    """API endpoint to execute LLM selection of similar concepts"""
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            selection_data = request.form.get('selectionData')
            selection_data_table = request.form.get('selectionDataTable')
            global_schema_summary = request.form.get('globalSchemaSummary')
            if not selection_data_table:
                return jsonify({'error': 'selectionData is required in form data.'}), 400
            selection_json = json.loads(selection_data)
            selection_table_json = json.loads(selection_data_table) if selection_data_table else None
            global_schema_summary_json = json.loads(global_schema_summary) if global_schema_summary else None
        elif request.content_type == 'application/json':
            # Get data from JSON body
            request_json = request.get_json()
            selection_json = request_json.get('selectionData')
            selection_table_json = request_json.get('selectionDataTable')
            global_schema_summary = request_json.get('globalSchemaSummary')

            if not selection_table_json:
                return jsonify({'error': 'JSON data is required.'}), 400
        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        result = select_concept.llm_select_concepts_logic(selection_json, selection_table_json, global_schema_summary)

        if 'error' in result:
            return jsonify(result), 400
        else:
            return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/llm-suggest-properties', methods=['POST'])
def llm_suggest_properties_route():
    """API endpoint to suggest properties mapping using LLM"""
    try:
        # Check if the request is multipart/form-data or JSON
        if request.content_type.startswith('multipart/form-data'):
            # Get data from form
            properties_data = request.form.get('tableForMappingProperties')
            global_schema_summary = request.form.get('globalSchemaSummary')
            if not properties_data and not global_schema_summary:
                return jsonify({'error': 'propertiesData and globalSchemaSummary are required in form data.'}), 400
            properties_json = json.loads(properties_data)
            global_schema_summary = json.loads(global_schema_summary) if global_schema_summary else None
        elif request.content_type == 'application/json':
            # Get data from JSON body
            request_json = request.get_json()
            if not request_json:
                return jsonify({'error': 'JSON data is required.'}), 400
            properties_json = request_json.get('tableForMappingProperties')
            global_schema_summary = request_json.get('globalSchemaSummary')
            global_schema_summary_json = json.loads(global_schema_summary) if global_schema_summary else None
        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        finalResults = []
        previous_mapping = []
        global_schema_summary_json['previous_mappings'] = []
        for i, properties in enumerate(properties_json):
            expected_column_count = f'{i+1} of {len(properties_json)}'
            result = select_properties.llm_suggest_properties_logic(properties, global_schema_summary_json)
            if 'success'==False in result:
                return jsonify(result), 400
            else:
                finalResults.append({
                    'message': result.get('message', ''),
                    'success': result.get('success', False),
                    'log': result.get('log', ''),
                    'results': result.get('results', [])
                })

        return jsonify({
            'success': True,
            'message': 'Successfully generate suggest properties',
            'results':finalResults
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/write-mapping', methods=['POST'])
def write_mapping_route():
    try:
        # Prepare request data based on content type
        if request.content_type.startswith('multipart/form-data'):
            request_data = request.form
            request_files = request.files
        elif request.content_type == 'application/json':
            request_data = request.get_json()
            request_files = {}
        else:
            return jsonify({'error': 'Content-Type must be multipart/form-data or application/json'}), 415

        result, status_code = write_mapping.write_mapping_route_logic(
            request_data, request_files, request.content_type
        )

        return jsonify(result), status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Process the mapping data (e.g., save to database)
    return jsonify({'message': 'Mapping written successfully'}), 200

#### Handle Model Configuration ####
@app.route('/api/model-config', methods=['GET'])
def get_model_config():
    """Get current LLM and embedding model configuration"""
    try:
        current = langchain_manager.get_current_config()
        available = langchain_manager.get_available_models()
        return jsonify({
            'current': current,
            'available': available
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/model-config', methods=['PUT'])
def update_model_config():
    """Update LLM provider and/or model configuration at runtime"""
    try:
        request_json = request.get_json()
        if not request_json:
            return jsonify({'error': 'JSON data is required.'}), 400

        provider = request_json.get('provider')
        llm_model = request_json.get('llm_model')
        embedding_model = request_json.get('embedding_model')

        if not any([provider, llm_model, embedding_model]):
            return jsonify({'error': 'At least one of provider, llm_model, or embedding_model is required.'}), 400

        # Validate provider if given
        available = langchain_manager.get_available_models()
        if provider and provider not in available:
            return jsonify({'error': f'Unsupported provider: {provider}. Available: {list(available.keys())}'}), 400

        changed = langchain_manager.update_model_config(
            provider=provider,
            llm_model=llm_model,
            embedding_model=embedding_model
        )

        return jsonify({
            'message': 'Model configuration updated successfully' if changed else 'No changes made',
            'current': langchain_manager.get_current_config()
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/llm-combined-mapping', methods=['POST'])
def llm_combined_mapping_route():
    """
    Ablation study endpoint.

    Single LLM call that maps ALL tables + columns to ontology classes AND
    properties in one shot.

    Input  : identical to /api/llm-select-concepts
    Output : union of /api/llm-select-concepts  (results_table)
                  and /api/llm-suggest-properties (property_results per table)
    """
    try:
        if request.content_type.startswith('multipart/form-data'):
            selection_data_table = request.form.get('selectionDataTable')
            global_schema_summary = request.form.get('globalSchemaSummary')
            base_uri = request.form.get('baseUri', 'http://example.com/')
            if not selection_data_table:
                return jsonify({'error': 'selectionDataTable is required.'}), 400
            selection_table_json = json.loads(selection_data_table)
            global_schema_summary_json = json.loads(global_schema_summary) if global_schema_summary else {}

        elif request.content_type == 'application/json':
            request_json = request.get_json()
            if not request_json:
                return jsonify({'error': 'JSON body is required.'}), 400
            selection_table_json = request_json.get('selectionDataTable')
            global_schema_summary_json = request_json.get('globalSchemaSummary', {})
            base_uri = request_json.get('baseUri', 'http://example.com/')
            if not selection_table_json:
                return jsonify({'error': 'selectionDataTable is required.'}), 400

        else:
            return jsonify({'error': 'Content-Type must be application/json or multipart/form-data'}), 415

        result = select_combined_ablation.llm_combined_full_mapping_logic(
            selection_table_json=selection_table_json,
            global_schema_summary=global_schema_summary_json,
            base_uri=base_uri,
        )

        if not result.get('success', False):
            return jsonify(result), 400

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
