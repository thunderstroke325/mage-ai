from IPython import get_ipython
from IPython.display import IFrame, Javascript, display
from enum import Enum
from mage_ai.data_cleaner.shared.utils import is_spark_dataframe
from mage_ai.server.app import (
    clean_df,
    clean_df_with_pipeline,
    connect_df,
    kill as kill_flask,
    launch as launch_flask,
)
from mage_ai.server.constants import SERVER_PORT
import logging
import os

IFRAME_HEIGHT = 1000
MAX_NUM_OF_ROWS = 100_000

logger = logging.getLogger(__name__)


class NotebookType(str, Enum):
    DATABRICKS = 'databricks'
    GOOGLE_COLAB = 'google_colab'


def infer_notebook_type():
    if os.environ.get('DATABRICKS_RUNTIME_VERSION'):
        return NotebookType.DATABRICKS
    elif type(get_ipython()).__module__.startswith('google.colab'):
        return NotebookType.GOOGLE_COLAB
    return None


def launch(
    host=None,
    port=None,
    inline=True,
    api_key=None,
    notebook_type=None,
    iframe_host=None,
    iframe_port=None,
    config={},
):
    if notebook_type is None:
        notebook_type = infer_notebook_type()
    if notebook_type == NotebookType.DATABRICKS:
        host = '0.0.0.0'
    thread = launch_flask(mage_api_key=api_key, host=host, port=port)
    if inline:
        display_inline_iframe(
            host=iframe_host or host,
            port=iframe_port or port,
            notebook_type=notebook_type,
            config=config,
        )

    return thread


def kill():
    kill_flask()


def display_inline_iframe(host=None, port=None, notebook_type=None, config={}):
    host = host or 'localhost'
    port = port or SERVER_PORT

    path_to_server = f'http://{host}:{port}'

    def __print_url():
        print(f'Open UI in another tab with url: {path_to_server}')

    if notebook_type == NotebookType.GOOGLE_COLAB:
        from google.colab.output import eval_js

        path_to_server = eval_js(f'google.colab.kernel.proxyPort({SERVER_PORT})')
        __print_url()
        display(
            Javascript(
                """
            (async ()=>{
                fm = document.createElement('iframe')
                fm.src = await google.colab.kernel.proxyPort(%s)
                fm.width = '95%%'
                fm.height = '%d'
                fm.frameBorder = 0
                document.body.append(fm)
            })();
            """
                % (SERVER_PORT, IFRAME_HEIGHT)
            )
        )
    elif notebook_type == NotebookType.DATABRICKS:
        required_args = [
            'cluster_id',
            'databricks_host',
            'workspace_id',
            'token',
        ]
        for arg in required_args:
            if arg not in config:
                logger.error(f'Parameter "{arg}" is required to generate proxy url.')
                return
        databricks_host = config.get('databricks_host')
        cluster_id = config.get('cluster_id')
        workspace_id = config.get('workspace_id')
        token = config.get('token')
        path_to_server = (
            f'https://{databricks_host}/driver-proxy-api/o/'
            f'{workspace_id}/{cluster_id}/{port}/?token={token}'
        )
        __print_url()
    else:
        __print_url()
        display(IFrame(path_to_server, width='95%', height=1000))


def connect_data(df, name, verbose=False):
    if is_spark_dataframe(df):
        # Convert pyspark dataframe to pandas
        df_spark = df
        row_count = df_spark.count()
        if row_count >= MAX_NUM_OF_ROWS:
            sample_fraction = MAX_NUM_OF_ROWS / row_count
            df = df_spark.sample(withReplacement=False, fraction=sample_fraction).toPandas()
        else:
            df = df_spark.toPandas()

    if df.shape[0] > MAX_NUM_OF_ROWS:
        feature_set, _ = connect_df(df.sample(MAX_NUM_OF_ROWS), name, verbose=verbose)
    else:
        feature_set, _ = connect_df(df, name, verbose=verbose)
    return feature_set


def clean(
    df,
    name=None,
    pipeline_uuid=None,
    pipeline_path=None,
    remote_pipeline_uuid=None,
    api_key=None,
    verbose=False,
):
    if pipeline_uuid is not None:
        df_clean = clean_df_with_pipeline(df, id=pipeline_uuid, verbose=verbose)
    elif pipeline_path is not None:
        df_clean = clean_df_with_pipeline(df, path=pipeline_path, verbose=verbose)
    elif remote_pipeline_uuid is not None:
        df_clean = clean_df_with_pipeline(
            df, remote_id=remote_pipeline_uuid, mage_api_key=api_key, verbose=verbose
        )
    else:
        _, df_clean = clean_df(df, name=name, verbose=verbose)
    return df_clean


def init(api_key):
    # verify api_key with Mage backend
    pass
