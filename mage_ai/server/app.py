from flask import Flask, render_template, request
from flask_cors import CORS
from mage_ai.data_cleaner.data_cleaner import analyze, clean as clean_data
from mage_ai.data_cleaner.pipelines.base import BasePipeline
from mage_ai.data_cleaner.shared.logger import VerboseFunctionExec
from mage_ai.data_cleaner.transformer_actions.utils import generate_action_titles
from mage_ai.server.client.mage import Mage
from mage_ai.server.constants import SERVER_PORT
from mage_ai.server.data.models import FeatureSet, Pipeline
from numpyencoder import NumpyEncoder
import argparse
import json
import logging
import os
import simplejson
import sys
import threading
import traceback


log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(
    __name__, static_url_path='', static_folder='frontend_dist', template_folder='frontend_dist'
)

CORS(app, resources={r'/*': {'origins': '*'}})

thread = None
api_key = None


def rescue_errors(endpoint, error_code=500):
    def handler(*args, **kwargs):
        try:
            response = endpoint(*args, **kwargs)
        except Exception as err:
            exception = str(err)
            response_obj = dict(
                error=dict(
                    code=error_code,
                    errors=traceback.format_stack(),
                    exception=exception,
                    message=traceback.format_exc(),
                    type=None,
                ),
            )
            response = app.response_class(
                response=json.dumps(response_obj),
                status=200,
                mimetype='application/json',
            )
            log.exception('An error was caught and reported to the client: ')
        return response

    return handler


@app.route('/', endpoint='index')
@app.route('/datasets', endpoint='dataset_list')
@rescue_errors
def index():
    return render_template('index.html')


@app.route('/datasets/<id>', endpoint='dataset_detail')
@rescue_errors
def dataset(id):
    return render_template('index.html')


@app.route('/process', methods=['POST'], endpoint='process')
@rescue_errors
def process():
    """
    request: {
        id: string (feature set id)
        clean: boolean
    }

    response: {
        id,
        metadata,
        sample_data,
        statistics,
        insights,
        suggestions
    }
    """
    request_data = request.json
    if not request_data:
        request_data = request.form

    id = request_data['id']
    if not id:
        return

    feature_set = FeatureSet(id=id, api_key=api_key)
    df = feature_set.data
    metadata = feature_set.metadata

    if request_data.get('clean', True):
        result = clean_data(df)
    else:
        result = analyze(df)

    feature_set.write_files(result)

    column_types = result['column_types']
    metadata['column_types'] = column_types

    feature_set.metadata = metadata

    response = app.response_class(
        response=simplejson.dumps(feature_set.to_dict(), ignore_nan=True),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/feature_sets', endpoint='feature_sets')
@rescue_errors
def feature_sets():
    """
    response: [
        {
            id,
            metadata,
        }
    ]
    """
    feature_sets = list(map(lambda fs: fs.to_dict(detailed=False), FeatureSet.objects()))
    valid_feature_sets = [
        f
        for f in feature_sets
        if set(['column_types', 'statistics']).issubset(f['metadata'].keys())
    ]
    response = app.response_class(
        response=simplejson.dumps(valid_feature_sets, ignore_nan=True),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/feature_sets/<id>', endpoint='feature_sets_get')
@rescue_errors
def feature_set(id):
    """
    response: [
        {
            id,
            metadata,
        }
    ]
    """
    if not FeatureSet.is_valid_id(id):
        raise RuntimeError(f'Unknown feature set id: {id}')
    feature_set = FeatureSet(id=id)
    response = app.response_class(
        response=simplejson.dumps(feature_set.to_dict(), ignore_nan=True),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/feature_sets/<id>/downloads/', endpoint='feature_set_download', methods=['POST'])
@rescue_errors
def feature_set_download(id):
    if not FeatureSet.is_valid_id(id):
        raise RuntimeError(f'Unknown feature set id: {id}')
    feature_set = FeatureSet(id=id)

    name = feature_set.metadata['name']
    name = name.replace(' ', '_')

    return app.response_class(
        response=feature_set.data.to_csv(index=False),
        status=200,
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="{name}.csv"',
        },
    )


@app.route('/feature_sets/<id>/versions/<version>', endpoint='feature_set_versions_get')
@rescue_errors
def feature_set_version(id, version):
    """
    response: [
        {
            id,
            metadata,
        }
    ]
    """
    if not FeatureSet.is_valid_id(id):
        raise RuntimeError(f'Unknown feature set id: {id}')
    feature_set = FeatureSet(id=id)
    response = app.response_class(
        response=simplejson.dumps(feature_set.to_dict(version=version), ignore_nan=True),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/feature_sets/<id>', methods=['PUT'], endpoint='feature_sets_put')
@rescue_errors
def update_feature_set(id):
    """
    request: {
        metadata,
        statistics,
        insights,
        suggestions,
    }

    response: {
        id,
        metadata,
        pipeline,
        sample_data,
        statistics,
        insights,
        suggestions,
    }
    """
    request_data = request.json
    feature_set = FeatureSet(id=id)
    feature_set.write_files(request_data)
    response = app.response_class(
        response=simplejson.dumps(feature_set.to_dict(), ignore_nan=True),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/pipelines', endpoint='pipelines')
@rescue_errors
def pipelines():
    """
    response: [
        {
            id,
            pipeline_actions,
        }
    ]
    """
    pipelines = list(map(lambda p: p.to_dict(detailed=False), Pipeline.objects()))
    response = app.response_class(
        response=json.dumps(pipelines, cls=NumpyEncoder), status=200, mimetype='application/json'
    )
    return response


@app.route('/pipelines/<id>', endpoint='pipelines_get')
@rescue_errors
def pipeline(id):
    """
    response: {
        id,
        actions,
    }
    """
    if not Pipeline.is_valid_id(id):
        raise RuntimeError(f'Unknown pipeline id: {id}')
    pipeline = Pipeline(id=id)
    response = app.response_class(
        response=json.dumps(pipeline.to_dict(), cls=NumpyEncoder),
        status=200,
        mimetype='application/json',
    )
    return response


@app.route('/pipelines/<id>', methods=['PUT'], endpoint='pipelines_put')
@rescue_errors
def update_pipeline(id):
    """
    request: {
        actions,
    }

    response: {
        id,
        actions,
    }
    """
    request_data = request.json
    pipeline = Pipeline(id=id)
    actions = request_data.get('actions', [])
    actions = generate_action_titles(actions)
    clean_pipeline = BasePipeline(actions=actions)
    # 1. Transform the data
    # 2. Recalculate stats and suggestions
    feature_set_id = pipeline.metadata.get('feature_set_id')
    if feature_set_id is not None:
        feature_set = FeatureSet(id=feature_set_id)
        df_transformed = clean_pipeline.transform(feature_set.data_orig, auto=False)
        result = clean_data(
            df_transformed,
            column_types=feature_set.metadata.get('column_types', {}),
            transform=False,
            verbose=True,
        )
        prev_version = len(pipeline.pipeline.actions)
        pipeline.pipeline = clean_pipeline
        feature_set.write_files(result, prev_version=prev_version)
    else:
        pipeline.pipeline = clean_pipeline

    if api_key is not None:
        pipeline.sync_pipeline(api_key)

    response = app.response_class(
        response=json.dumps(pipeline.to_dict(), cls=NumpyEncoder),
        status=200,
        mimetype='application/json',
    )
    return response


# @app.route("/feature_sets/<id>/columns/<column_name>")
# def feature_set_column(id, column_name):
#     feature_set = FeatureSet(id=id)
#     return feature_set.column(column_name)


def clean_df(df, name, verbose=False):
    feature_set = FeatureSet(df=df, name=name)

    result = clean_data(df, verbose=verbose)

    feature_set.write_files(result)
    return (feature_set, result['df'])


def clean_df_with_pipeline(
    df, id=None, path=None, remote_id=None, mage_api_key=None, verbose=False
):
    pipeline = None
    if id is not None:
        with VerboseFunctionExec(f'Loading pipeline with uuid \'{id}\' from file', verbose=verbose):
            pipeline = Pipeline(id=id).pipeline
    elif path is not None:
        with VerboseFunctionExec(f'Loading pipeline from path \'{path}\'', verbose=verbose):
            pipeline = Pipeline(path=path).pipeline
    elif remote_id is not None:
        with VerboseFunctionExec(
            f'Loading pipeline \'{remote_id}\' from Mage servers', verbose=verbose
        ):
            final_key = mage_api_key if mage_api_key is not None else api_key
            pipeline = BasePipeline(actions=Mage().get_pipeline_actions(remote_id, final_key))
    if pipeline is None:
        log.error('Please provide a valid pipeline id or config path.')
        return df
    pipeline.verbose = verbose
    return pipeline.transform(df, auto=False)


def connect_df(df, name, verbose=False):
    feature_set = FeatureSet(df=df, name=name)

    result = clean_data(df, transform=False, verbose=verbose)

    feature_set.write_files(result, write_orig_data=True)
    return (feature_set, df)


class ThreadWithTrace(threading.Thread):
    def __init__(self, *args, **keywords):
        threading.Thread.__init__(self, *args, **keywords)
        self.killed = False

    def start(self):
        self.__run_backup = self.run
        self.run = self.__run
        threading.Thread.start(self)

    def __run(self):
        sys.settrace(self.globaltrace)
        self.__run_backup()
        self.run = self.__run_backup

    def globaltrace(self, frame, event, arg):
        if event == 'call':
            return self.localtrace
        else:
            return None

    def localtrace(self, frame, event, arg):
        if self.killed:
            if event == 'line':
                raise SystemExit()
        return self.localtrace

    def kill(self):
        self.killed = True


def launch(mage_api_key=None, host=None, port=None) -> None:
    global thread
    global api_key
    if mage_api_key:
        api_key = mage_api_key
        sync_pipelines()

    if host is None:
        host = os.getenv('HOST', 'localhost')
    if port is None:
        port = os.getenv('PORT', SERVER_PORT)

    app_kwargs = {
        'debug': False,
        'host': host,
        'port': port,
    }
    thread = ThreadWithTrace(target=app.run, kwargs=app_kwargs, daemon=True)
    thread.start()
    print(f'Mage running on host and port {host}:{port}')
    return thread


def sync_pipelines():
    print('Syncing pipelines with cloud database.', end='')
    local_pipelines = Pipeline.objects()
    for pipeline in local_pipelines:
        print('.', end='')
        pipeline.sync_pipeline(api_key)


def kill():
    if thread is not None:
        thread.kill()
        thread.join()
        try:
            alive = thread.isAlive()
        except AttributeError:
            # thread's method isAlive() was renamed to is_alive() in python version 3.9
            alive = thread.is_alive()
        if not alive:
            print('Flask server is terminated')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', type=str, default=None)
    parser.add_argument('--port', type=int, default=None)
    args = parser.parse_args()

    app.debug = os.getenv('DEBUG', True)
    host = args.host or os.getenv('HOST')
    port = args.port or os.getenv('PORT', SERVER_PORT)

    args = dict(port=port)
    if host:
        args['host'] = host

    print(f'Mage running on host and port {host}:{port}')

    app.run(**args)
