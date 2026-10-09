import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Sub } from './ui';
import { thaiDate } from '../domain/utils';
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 5 }}>
      <Sub>{label}</Sub>
      <Button secondary title={thaiDate(value)} onPress={() => setOpen(true)} />
      {open && (
        <>
          <DateTimePicker
            value={new Date(`${value}T12:00:00+07:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            timeZoneName="Asia/Bangkok"
            onChange={(event, date) => {
              if (Platform.OS === 'android') setOpen(false);
              if (event.type !== 'dismissed' && date) {
                const parts = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Bangkok',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).formatToParts(date);
                onChange(
                  ['year', 'month', 'day']
                    .map((t) => parts.find((p) => p.type === t)!.value)
                    .join('-'),
                );
              }
            }}
          />
          {Platform.OS === 'ios' && (
            <Button title="เลือกวันที่นี้" onPress={() => setOpen(false)} />
          )}
        </>
      )}
    </View>
  );
}
