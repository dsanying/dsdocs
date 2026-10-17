export function accountChanges(values: Record<string, unknown>, self: boolean) {
  return {
    username: values.username,
    password: values.password,
    ...(self ? { currentPassword: values.currentPassword } : {}),
  };
}
