from mage_ai.data_cleaner.column_types.constants import NUMBER_TYPES

STATUS_NOT_APPLIED = 'not_applied'
STATUS_COMPLETED = 'completed'


class BaseRule:
    def __init__(self, df, column_types, statistics):
        self.df = df
        self.df_columns = df.columns.tolist()
        self.column_types = column_types
        self.statistics = statistics

    def _filter_numeric_types(self):
        numeric_columns = []
        numeric_df = self.df.copy()
        for column in self.df_columns:
            if self.column_types[column] in NUMBER_TYPES:
                numeric_df.loc[:, column] = numeric_df.loc[:, column].astype(float)
                numeric_columns.append(column)
            else:
                numeric_df.drop(column, axis=1, inplace=True)
        numeric_df = numeric_df.dropna(axis=0)
        return numeric_df, numeric_columns

    def evaluate(self):
        """Evaluate data cleaning rule and generate suggested actions
        Returns
        -------
        A list of suggested actions
        """
        return []

    def _build_action_variables(self, columns):
        variable_set = {}
        for column_name in columns:
            variable_set[column_name] = {
                'feature': {
                    'column_type': self.column_types[column_name],
                    'uuid': column_name,
                },
                'type': 'feature',
            }
        return variable_set

    def _build_transformer_action_suggestion(
        self,
        title,
        message,
        action_type,
        action_arguments=[],
        action_code='',
        action_options={},
        action_variables={},
        axis='column',
        outputs=[],
    ):
        return dict(
            title=title,
            message=message,
            status=STATUS_NOT_APPLIED,
            action_payload=dict(
                action_type=action_type,
                action_arguments=action_arguments,
                action_code=action_code,
                action_options=action_options,
                action_variables=action_variables,
                axis=axis,
                outputs=outputs,
            ),
        )
