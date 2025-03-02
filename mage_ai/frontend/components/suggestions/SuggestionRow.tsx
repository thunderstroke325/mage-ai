import React, { useContext, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ThemeContext } from 'styled-components';

import ActionForm from '@components/ActionForm';
import ActionPayloadType from '@interfaces/ActionPayloadType';
import Button from '@oracle/elements/Button';
import Flex from '@oracle/components/Flex';
import FlexContainer from '@oracle/components/FlexContainer';
import Link from '@oracle/elements/Link';
import RowCard from '@oracle/components/RowCard';
import Spacing from '@oracle/elements/Spacing';
import Spinner from '@oracle/components/Spinner';
import Text from '@oracle/elements/Text';
import TransformerActionType from '@interfaces/TransformerActionType';
import { ArrowDown, ArrowUp, Close, Edit } from '@oracle/icons';
import { FeatureResponseType } from '@interfaces/FeatureType';
import { MAX_LINES_ACTIONS, READ_ONLY } from '@oracle/styles/editor/rules';
import { MONO_FONT_FAMILY_REGULAR } from '@oracle/styles/fonts/primary';
import { REGULAR_FONT_SIZE } from '@oracle/styles/fonts/sizes';
import { UNIT } from '@oracle/styles/units/spacing';
import { goToWithQuery } from '@utils/routing';

export type SuggestionRowProps = {
  action: TransformerActionType;
  border?: boolean;
  features?: FeatureResponseType[];
  featureIdMapping: {
    [key: string]: number;
  };
  featureSetId?: string | number;
  idx: number;
  isLoading?: boolean;
  link?: () => void;
  onClose?: () => void;
  saveAction?: (ActionPayloadType) => void;
  showIdx?: boolean;
};

const CodeEditor = dynamic(
  async () => {
    const ace = await import('react-ace');
    require('ace-builds/src-noconflict/mode-python');
    require('ace-builds/src-noconflict/ace');
    return ace;
  },
  {
    ssr: false,
  },
);

const SuggestionRow = ({
  action,
  border,
  features,
  featureIdMapping,
  featureSetId,
  idx,
  isLoading,
  link,
  onClose,
  saveAction,
  showIdx,
}: SuggestionRowProps) => {
  const themeContext = useContext(ThemeContext);

  const columns = useMemo(() => features.map(({ uuid }) => uuid), [ features]);

  const {
    action_payload,
    message,
    title,
  } = action;
  const {
    action_arguments: actionArguments,
    action_code: actionCode,
    action_options: actionOptions,
  } = action_payload;

  useEffect(() => setActionPayload(action_payload), [action_payload]);

  const numFeatures = actionArguments?.length || 0;
  const numOptions = actionOptions ? Object.keys(actionOptions).length : 0;

  const [editing, setEditing] = useState(false);
  const [displayAllCols, setDisplayAllCols] = useState(false);
  const [actionPayload, setActionPayload] = useState<ActionPayloadType>(action_payload);

  const DISPLAY_COLS_NUM = 5;

  const displayArguments = displayAllCols ? actionArguments : actionArguments?.slice(0, DISPLAY_COLS_NUM);
  const featureLinks = displayArguments?.map((col: string) => (
    <span key={col}>
      {col in featureIdMapping ?
        <Link
          noOutline
          onClick={() => goToWithQuery({
            column: columns.indexOf(col),
          }, {
            pushHistory: true,
          })}
          preventDefault
          secondary
        >
          <Text
            maxWidth={30 * UNIT}
            monospace
            secondary
            title={col}
          >
            {col}
          </Text>
        </Link>
        :
        <Text
          color={themeContext.monotone.grey400}
          maxWidth={30 * UNIT}
          monospace
          title={col}
        >
          {col}
        </Text>
      }
    </span>
  ));

  return (
    <RowCard
      border={border}
      flexStart
    >
      {link &&
        <Spacing mr={2}>
          {isLoading && <Spinner small />}

          {!isLoading && !editing && (
            <Link
              bold
              noHoverUnderline
              onClick={link}
              preventDefault
            >
              Apply
            </Link>
          )}
        </Spacing>
      }

      {showIdx && (
        <Spacing mr={2}>
          <Text>{idx + 1}</Text>
        </Spacing>
      )}

      <Flex
        flex={1}
        flexDirection="column"
      >
        <Text bold inline>
          {title}
          {numFeatures > 0 && ': '}
        </Text>

        {featureLinks}
        {numFeatures > DISPLAY_COLS_NUM &&
          <Link
            noOutline
            onClick={() => setDisplayAllCols(!displayAllCols)}
            secondary
          >
            <Text bold secondary>
              {displayAllCols
                ?
                  <>
                    <ArrowUp secondary size={10} />&nbsp;
                    Show less
                  </>
                :
                  <>
                    <ArrowDown secondary size={10} />&nbsp;
                    {numFeatures - DISPLAY_COLS_NUM} more
                  </>
              }
            </Text>
          </Link>
        }

        {message && (
          <Text muted small>
            {message}
          </Text>
        )}

        {!message && actionOptions && (
          <FlexContainer>
            {Object.entries(actionOptions).map(([k, v], idx: number) => (
              <Text key={k} inline muted small>
                <Text inline monospace muted small>{k}</Text>: {v}{numOptions >= 2 && idx !== numOptions - 1 && <>,&nbsp;</>}
              </Text>
            ))}
          </FlexContainer>
        )}

        {actionCode && !editing && (
          <CodeEditor
            maxLines={MAX_LINES_ACTIONS}
            mode="python"
            setOptions={READ_ONLY}
            style={{
              backgroundColor: themeContext.monotone.grey100,
              fontFamily: MONO_FONT_FAMILY_REGULAR,
              fontSize: REGULAR_FONT_SIZE,
              overflow: 'auto',
              width: 'inherit',
            }}
            value={actionCode}
            wrapEnabled
          />
        )}

        {editing &&
          <ActionForm
            actionType={actionPayload?.action_type}
            axis={actionPayload?.axis}
            features={features}
            noBorder
            noHeader
            onSave={(actionPayloadOverride: ActionPayloadType) => saveAction({
              action_payload: {
                ...actionPayload,
                ...actionPayloadOverride,
              },
            })}
            payload={actionPayload}
            setPayload={setActionPayload}
          />
        }
      </Flex>

      <FlexContainer>
        {/* TODO: add Preview here */}
        {saveAction && (
          <Button
            basic
            iconOnly
            onClick={() => setEditing(!editing)}
            padding="0px"
            transparent
          >
            <Edit
              black={editing}
              muted
              size={16}
            />
          </Button>
        )}
        {onClose && (
          <>
            <Spacing mr={1} />

            {isLoading && <Spinner small />}

            {!isLoading && (
              <Button
                basic
                iconOnly
                onClick={onClose}
                padding="0px"
                transparent
              >
                <Close muted />
              </Button>
            )}
          </>
        )}
      </FlexContainer>
    </RowCard>
  );
};

export default SuggestionRow;
