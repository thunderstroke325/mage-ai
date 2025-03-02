import React, {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
} from 'react';
import LoadingBar from 'react-top-loading-bar';

import Button from '@oracle/elements/Button';
import ColumnAnalysis from '@components/datasets/Insights/ColumnAnalysis';
import ColumnReports from '@components/datasets/columns/ColumnReports';
import DatasetDetail, { DatasetDetailSharedProps } from '../Detail';
import DataTable from '@components/DataTable';
import FeatureProfiles from '@components/datasets/FeatureProfiles';
import FeatureType, { ColumnTypeEnum } from '@interfaces/FeatureType';
import Flex from '@oracle/components/Flex';
import FlexContainer from '@oracle/components/FlexContainer';
import Overview from '@components/datasets/Insights/Overview';
import SimpleDataTable from '@oracle/components/Table/SimpleDataTable';
import Spacing from '@oracle/elements/Spacing';
import Text from '@oracle/elements/Text';
import light from '@oracle/styles/themes/light';
import usePrevious from '@utils/usePrevious';
import { BEFORE_WIDTH } from '@oracle/components/Layout/MultiColumn.style';
import {
  COLUMN_HEADER_CHART_HEIGHT,
  buildRenderColumnHeader,
  createMetricsSample,
  createStatisticsSample,
} from './utils';
import { Close } from '@oracle/icons';
import { LARGE_WINDOW_WIDTH } from '@components/datasets/constants';
import { PADDING_UNITS, UNIT } from '@oracle/styles/units/spacing';
import { REGULAR_LINE_HEIGHT } from '@oracle/styles/fonts/sizes';
import { getFeatureSetInvalidValuesAll, getFeatureSetStatistics } from '@utils/models/featureSet';
import { goToWithQuery } from '@utils/routing';
import { indexBy } from '@utils/array';
import { queryFromUrl } from '@utils/url';
import { useWindowSize } from '@utils/sizes';
import { WARNINGS } from '../constants';

export const TABS_QUERY_PARAM = 'tabs[]';
export const SHOW_COLUMNS_QUERY_PARAM = 'show_columns';
export const COLUMN_QUERY_PARAM = 'column';

export const TAB_REPORTS = 'Reports';
const TAB_VISUALIZATIONS = 'Visualizations';
const TAB_DATA = 'Data';
const TABS_IN_ORDER = [
  TAB_REPORTS,
  TAB_VISUALIZATIONS,
  TAB_DATA,
];

type DatasetOverviewProps = {
  selectedColumnIndex?: number;
} & DatasetDetailSharedProps;

function DatasetOverview({
  featureSet,
  fetchFeatureSet,
  selectedColumnIndex,
}: DatasetOverviewProps) {
  const refLoadingBar = useRef(null);
  const mainContentRef = useRef(null);

  const { width: windowWidth } = useWindowSize();
  const windowWidthPrevious = usePrevious(windowWidth);

  const [errorMessages, setErrorMessages] = useState(null);
  const qFromUrl = queryFromUrl();
  const {
    show_columns: showColumnsFromUrl,
  } = qFromUrl;
  const tabsFromUrlInit = qFromUrl[TABS_QUERY_PARAM];
  const tabsFromUrl = tabsFromUrlInit
    ? Array.isArray(tabsFromUrlInit) ? tabsFromUrlInit : [tabsFromUrlInit]
    : [];

  const setTabs = useCallback((newTab: string, pushHistory: boolean = true) => {
    goToWithQuery({
      [TABS_QUERY_PARAM]: newTab,
    }, {
      pushHistory,
    });
  }, [tabsFromUrl]);

  useEffect(() => {
    if (tabsFromUrl.length === 0) {
      // @ts-ignore
      setTabs(TAB_REPORTS, false);
    }
  }, [setTabs, tabsFromUrl]);

  useEffect(() => {
    if (typeof showColumnsFromUrl === 'undefined' && windowWidth >= LARGE_WINDOW_WIDTH) {
      goToWithQuery({
        show_columns: 1,
      });
    }
  }, [showColumnsFromUrl, windowWidth]);

  const {
    insights,
    metadata,
    statistics,
  } = featureSet || {};

  const {
    columns: columnsAll,
    rows: rowsAll,
  } = featureSet?.sample_data || {};
  const selectedColumn = columnsAll?.[Number(selectedColumnIndex)];
  const columns = useMemo(() => selectedColumn ? [selectedColumn] : columnsAll, [
    columnsAll,
    selectedColumn,
  ]);
  const indexOfValueForColumn = columnsAll?.indexOf(selectedColumn);
  const rows = useMemo(
    () => selectedColumn ? rowsAll?.map(row => [row[indexOfValueForColumn]]) : rowsAll,
    [
      selectedColumn,
      indexOfValueForColumn,
      rowsAll,
    ],
  );

  const {
    column_types: columnTypes,
  } = metadata || {};
  const features: FeatureType[] = columnsAll?.map(uuid => ({
    columnType: columnTypes[uuid],
    uuid,
  }));

  const qualityMetrics = statistics ? createMetricsSample(statistics, columnTypes) : null;
  const statSample = (statistics && columnTypes)
    ? createStatisticsSample(statistics, columnTypes)
    : null;

  const insightsByFeatureUUID = useMemo(() => indexBy(insights?.[0] || [], ({
    feature: {
      uuid,
    },
  }) => uuid), [
    insights,
  ]);

  const insightsOverview = selectedColumn
    ? insightsByFeatureUUID[selectedColumn]
    : insights?.[1] || {};

  const columnsVisible = Number(showColumnsFromUrl) === 1;
  const columnsVisiblePrevious = usePrevious(columnsVisible);

  const colType = features?.find((feature) => feature.uuid === selectedColumn)?.columnType;

  const {
    height: dataTableHeightInit,
    width: dataTableWidthInit,
  } = mainContentRef?.current?.getBoundingClientRect?.() || {};

  const paddingAndBorder = (PADDING_UNITS * UNIT * 2) + (1 * 2);
  let dataTableHeight = 0;
  if (dataTableHeightInit) {
    dataTableHeight = dataTableHeightInit - (paddingAndBorder + 2);
  }

  const dataTableWidth = useMemo(() => {
    let val = 0;

    if (dataTableWidthInit) {
      val = dataTableWidthInit - paddingAndBorder;

      if (!columnsVisiblePrevious && columnsVisible) {
        val -= BEFORE_WIDTH;
      } else if (columnsVisiblePrevious && !columnsVisible) {
        val += BEFORE_WIDTH;
      }
    }

    return val;
  }, [
    columnsVisible,
    columnsVisiblePrevious,
    dataTableWidthInit,
    paddingAndBorder,
    windowWidth === windowWidthPrevious,
  ]);

  const renderColumnHeader = useCallback(buildRenderColumnHeader({
    columnTypes,
    columns,
    insightsByFeatureUUID,
    insightsOverview,
    statistics,
  }), [
    columnTypes,
    columns,
    insightsByFeatureUUID,
    insightsOverview,
    statistics,
  ]);

  const featureSetStats = getFeatureSetStatistics(featureSet, selectedColumn);
  const {
    count,
  } = featureSetStats;

  const invalidValuesAll = statistics ? getFeatureSetInvalidValuesAll(featureSet, columnsAll) : null;

  return (
    <DatasetDetail
      columnsVisible={columnsVisible}
      featureSet={featureSet}
      fetchFeatureSet={fetchFeatureSet}
      hideColumnsHeader={windowWidth < LARGE_WINDOW_WIDTH}
      mainContentRef={mainContentRef}
      onTabClick={t => setTabs(t)}
      refLoadingBar={refLoadingBar}
      selectedColumnIndex={selectedColumnIndex}
      selectedTab={tabsFromUrl?.[0]}
      setErrorMessages={setErrorMessages}
      tabs={TABS_IN_ORDER}
    >
      <LoadingBar
        className="loading-bar"
        color={light.brand.fire500}
        containerStyle={{
          position: 'relative',
        }}
        ref={refLoadingBar}
        shadow={false}
      />

      {errorMessages?.length >= 1 && (
        <Spacing mb={5}>
          <FlexContainer justifyContent="space-between">
            <Text bold>
              Errors
            </Text>
            <Button
              basic
              iconOnly
              onClick={() => setErrorMessages(null)}
              padding="0px"
              transparent
            >
              <Close muted />
            </Button>
          </FlexContainer>
          {errorMessages?.map((msg: string) => (
            <Text key={msg} monospace xsmall>
              {msg}
            </Text>
          ))}
        </Spacing>
      )}

      {tabsFromUrl?.includes(TAB_REPORTS) && (
        <>
          {selectedColumn && (
            <ColumnReports
              column={selectedColumn}
              featureSet={featureSet}
            />
          )}

          {!selectedColumn && (
            <>
              <FlexContainer
                justifyContent="center"
                responsive
              >
                <Flex flex={1} flexDirection="column">
                  {qualityMetrics && (
                    <Spacing mb={PADDING_UNITS}>
                      <SimpleDataTable
                        columnFlexNumbers={[2, 1, 2]}
                        columnHeaders={[{ label: 'Quality metrics' }]}
                        rowGroupData={[qualityMetrics]}
                        warnings={WARNINGS.qualityMetrics}
                      />
                    </Spacing>
                  )}
                </Flex>

                <Spacing ml={PADDING_UNITS} />

                <Flex flex={1}>
                  {statSample && (
                    <SimpleDataTable
                      columnFlexNumbers={[1, 1]}
                      columnHeaders={[{ label: 'Statistics' }]}
                      rowGroupData={[statSample]}
                      warnings={WARNINGS.statistics}
                    />
                  )}
                </Flex>
              </FlexContainer>

              <Spacing mt={PADDING_UNITS}>
                <FeatureProfiles
                  featureSet={featureSet}
                  features={features}
                />
              </Spacing>
            </>
          )}
        </>
      )}

      {tabsFromUrl?.includes(TAB_VISUALIZATIONS) && (
        <>
          {selectedColumn && count > 0 && (
            <ColumnAnalysis
              column={selectedColumn}
              features={features}
              insights={insightsOverview}
              statisticsByColumn={
                (colType === ColumnTypeEnum.TEXT 
                  ? statistics?.[`${selectedColumn}/word_distribution`]
                  : statistics?.[`${selectedColumn}/value_counts`]
                ) || {}}
              statisticsOverview={statistics}
            />
          )}

          {selectedColumn && count === 0 && (
            <Text bold large>
              There are no visualizations available because the column has no data
            </Text>
          )}

          {!selectedColumn && (
            <Overview
              features={features}
              insightsOverview={insightsOverview}
              statistics={statistics}
            />
          )}
        </>
      )}

      {tabsFromUrl?.includes(TAB_DATA) && columns?.length >= 1 && (
        <DataTable
          columnHeaderHeight={selectedColumn
            ? null
            : COLUMN_HEADER_CHART_HEIGHT + (UNIT * 3) + REGULAR_LINE_HEIGHT
          }
          columns={columns}
          height={dataTableHeight}
          invalidValues={invalidValuesAll}
          renderColumnHeader={selectedColumn ? null : renderColumnHeader}
          rows={rows}
          width={dataTableWidth}
        />
      )}
    </DatasetDetail>
  );
}

export default DatasetOverview;
