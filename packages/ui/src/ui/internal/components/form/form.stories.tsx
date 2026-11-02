import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { useForm } from "react-hook-form";

// The source panel of this story is copy-pasted by consumers, so it may only
// contain names the published API actually has (SDL-246). The internal
// spellings (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl` as a
// wrapper, `FormMessage`, `Input`) are not exported — `Field.*` and
// `FormControl.Input` are. Imports therefore go through the public barrel, not
// through `./form` and `../input/input`.
import { Button, Field, FormControl } from "../../../index";

const meta = {
  title: "Components/Forms/Field",
  component: Field.Item,
} satisfies Meta<typeof Field.Item>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Хард-рул #8: части `Field.*` живут ТОЛЬКО внутри `<Field.Root {...form}>`
 * (FormProvider) — без него `Field.Label` падает на getFieldState.
 *
 * Форма объявлена ВНУТРИ render, а не рядом с meta: панель Source показывает
 * тело истории и ничего больше, поэтому общий хелпер пришёл бы консьюмеру как
 * `<DemoForm />` без определения (SDL-248).
 */
export const Default: Story = {
  render: () => {
    const DemoForm = () => {
      const form = useForm<{ email: string }>({
        defaultValues: { email: "" },
      });

      return (
        <Field.Root {...form}>
          <form
            className="max-w-sm space-y-4"
            onSubmit={form.handleSubmit(() => {})}
          >
            <Field.Field
              name="email"
              render={({ field }) => (
                <Field.Item>
                  <Field.Label>Email</Field.Label>
                  <Field.Control>
                    <FormControl.Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </Field.Control>
                  <Field.Description>
                    Used for the login link only.
                  </Field.Description>
                  <Field.Message />
                </Field.Item>
              )}
            />
            <Button type="submit">Save</Button>
          </form>
        </Field.Root>
      );
    };

    return <DemoForm />;
  },
};

/** Ошибка: label → text-destructive (data-error), контрол → aria-invalid.
 * Ошибка здесь ставится вручную через `setError`, потому что история
 * показывает ВИД ошибки, а не работу валидации. */
export const WithError: Story = {
  render: () => {
    const DemoForm = () => {
      const form = useForm<{ email: string }>({
        defaultValues: { email: "not-an-email" },
      });

      React.useEffect(() => {
        form.setError("email", {
          type: "manual",
          message: "Enter a valid email address.",
        });
      }, [form]);

      return (
        <Field.Root {...form}>
          <form
            className="max-w-sm space-y-4"
            onSubmit={form.handleSubmit(() => {})}
          >
            <Field.Field
              name="email"
              render={({ field }) => (
                <Field.Item>
                  <Field.Label>Email</Field.Label>
                  <Field.Control>
                    <FormControl.Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </Field.Control>
                  <Field.Description>
                    Used for the login link only.
                  </Field.Description>
                  <Field.Message />
                </Field.Item>
              )}
            />
            <Button type="submit">Save</Button>
          </form>
        </Field.Root>
      );
    };

    return <DemoForm />;
  },
};

/** row-layout `Field.Item`: label и контрол в одну строку. */
export const RowLayout: Story = {
  render: () => {
    const RowForm = () => {
      const form = useForm<{ slug: string }>({ defaultValues: { slug: "" } });
      return (
        <Field.Root {...form}>
          <Field.Field
            name="slug"
            render={({ field }) => (
              <Field.Item layout="row" gap={3} align="center">
                <Field.Label>Slug</Field.Label>
                <Field.Control>
                  <FormControl.Input placeholder="about-us" {...field} />
                </Field.Control>
              </Field.Item>
            )}
          />
        </Field.Root>
      );
    };
    return <RowForm />;
  },
};
