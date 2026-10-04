import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { SendIcon } from '../components/common/Icons';

interface AsistenteScreenProps {
  onOpenNewRequest: (cat?: 'vac' | 'per' | 'olv' | 'ext') => void;
}

export function AsistenteScreen({ onOpenNewRequest }: AsistenteScreenProps) {
  const { chatMessages, sendChatMessage, isTyping, t } = useApp();
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const suggestions = [
    t.suggestVacation,
    t.suggestShift,
    t.suggestPermit,
    t.suggestPrivacy,
  ];

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [chatMessages, isTyping]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const msg = inputText;
    setInputText('');
    sendChatMessage(msg);
  };

  const handleSuggestionPress = (prompt: string) => {
    sendChatMessage(prompt);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
      >
        {/* Messages */}
        {chatMessages.map((msg) => {
          const isUser = msg.from === 'user';
          return (
            <View
              key={msg.id}
              style={[
                styles.messageRow,
                isUser ? styles.messageRowUser : styles.messageRowBot,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isUser ? styles.bubbleUser : styles.bubbleBot,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isUser ? styles.textUser : styles.textBot,
                  ]}
                >
                  {msg.text}
                </Text>

                {msg.actionCategory && (
                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => {
                      onOpenNewRequest(msg.actionCategory);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionChipText}>{t.openRequestForm}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {isTyping && (
          <View style={[styles.messageRow, styles.messageRowBot]}>
            <View style={[styles.messageBubble, styles.bubbleBot, styles.typingBubble]}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.typingText}>{t.typing}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Suggested prompts carousel */}
      <View style={styles.suggestionsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsContent}>
          {suggestions.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.suggestionPill}
              onPress={() => handleSuggestionPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionPillText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t.chatPlaceholder}
          placeholderTextColor={Colors.textMuted}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.8}
        >
          <SendIcon size={18} color={Colors.textWhite} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowBot: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: Colors.cardBg,
    borderColor: Colors.cardBorder,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: Colors.textWhite,
  },
  textBot: {
    color: Colors.textPrimary,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  typingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actionChip: {
    marginTop: 8,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  actionChipText: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
  },
  suggestionsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingVertical: 8,
    backgroundColor: Colors.bg,
  },
  suggestionsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestionPill: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionPillText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: Colors.bg,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 18,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
