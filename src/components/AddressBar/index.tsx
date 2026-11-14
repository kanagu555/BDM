import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Radius, Spacing, Typography } from '../../theme';
import { isProbablyUrlInput } from '../../utils/urlUtils';
import {
  ArrowRightIcon,
  CloseIcon,
  GlobeIcon,
  SearchIcon,
} from '../Icons/BdmIcons';

interface AddressBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (submittedValue: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const AddressBar: React.FC<AddressBarProps> = ({
  value,
  onChangeText,
  onSubmit,
  isLoading = false,
  placeholder = 'Search or enter website URL...',
}) => {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  const looksLikeUrl = isProbablyUrlInput(value);
  const needsHttpsHint =
    looksLikeUrl && !/^https?:\/\//i.test(value.trim());

  const handleTriggerSubmit = () => {
    if (!value.trim() || isLoading) {
      return;
    }
    onSubmit(value);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderColor: isFocused ? colors.primary : colors.border,
            shadowColor: isFocused ? colors.primary : '#000000',
          },
        ]}>
        <View
          style={[
            styles.leadingIconWrap,
            {
              backgroundColor: looksLikeUrl
                ? colors.primarySoft
                : colors.surfaceElevated,
            },
          ]}>
          {looksLikeUrl ? (
            <GlobeIcon size={18} color={colors.primary} />
          ) : (
            <SearchIcon size={18} color={colors.textSecondary} />
          )}
        </View>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={handleTriggerSubmit}
          style={[styles.input, { color: colors.textPrimary }]}
        />

        {value.length > 0 && !isLoading ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear address bar"
            onPress={() => onChangeText('')}
            style={styles.clearButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <CloseIcon size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={looksLikeUrl ? 'Open URL' : 'Search'}
          activeOpacity={0.85}
          onPress={handleTriggerSubmit}
          disabled={!value.trim() || isLoading}
          style={[
            styles.submitButton,
            {
              backgroundColor: value.trim()
                ? colors.primary
                : colors.surfaceElevated,
            },
          ]}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text
                style={[
                  styles.submitText,
                  {
                    color: value.trim() ? '#FFFFFF' : colors.textSecondary,
                  },
                ]}>
                {looksLikeUrl ? 'Go' : 'Search'}
              </Text>
              <ArrowRightIcon
                size={15}
                color={value.trim() ? '#FFFFFF' : colors.textSecondary}
              />
            </>
          )}
        </TouchableOpacity>
      </View>

      {needsHttpsHint ? (
        <View style={styles.helperRow}>
          <Text style={[styles.helperText, { color: colors.primary }]}>
            Auto-HTTPS enabled: will open https://{value.trim()}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    paddingLeft: Spacing.xs,
    paddingRight: 6,
    paddingVertical: 6,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  leadingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  clearButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    height: 40,
    borderRadius: Radius.lg,
    justifyContent: 'center',
  },
  submitText: {
    ...Typography.subtitle,
    fontSize: 13,
  },
  helperRow: {
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
  },
  helperText: {
    ...Typography.caption,
  },
});
