/** Phase 3.8 — coverage lift for cn() + small primitives. */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cn } from "../lib/cn";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "../components/ui/Tabs";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/StatusBadge";

describe("cn", () => {
  it("joins truthy class fragments and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b", "")).toBe("a b");
  });
  it("returns empty string when nothing truthy is passed", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("Select / Textarea", () => {
  it("Select fires onChange", () => {
    const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      expect(e.target.value).toBe("b");
    };
    render(
      <Select defaultValue="a" onChange={onChange} aria-label="pick">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    fireEvent.change(screen.getByLabelText("pick"), { target: { value: "b" } });
  });

  it("Textarea respects invalid prop", () => {
    render(<Textarea invalid placeholder="notes" />);
    expect(screen.getByPlaceholderText("notes")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("Textarea has focus ring styles", () => {
    render(<Textarea placeholder="focus-test" />);
    expect(screen.getByPlaceholderText("focus-test")).toHaveClass("focus:ring-2");
    expect(screen.getByPlaceholderText("focus-test")).toHaveClass("focus:ring-indigo-400/20");
  });

  it("Textarea has invalid focus ring styles", () => {
    render(<Textarea invalid placeholder="invalid-test" />);
    expect(screen.getByPlaceholderText("invalid-test")).toHaveClass("focus:ring-red-400/20");
  });

  it("Textarea has transition styles", () => {
    render(<Textarea placeholder="trans-test" />);
    expect(screen.getByPlaceholderText("trans-test")).toHaveClass("transition-colors");
  });
});

describe("Tabs", () => {
  it("renders only the active panel and switches on Tab click", () => {
    function Harness() {
      const [v, setV] = React.useState("one");
      return (
        <Tabs value={v} onChange={setV}>
          <TabList>
            <Tab value="one">One</Tab>
            <Tab value="two">Two</Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="one">Body One</TabPanel>
            <TabPanel value="two">Body Two</TabPanel>
          </TabPanels>
        </Tabs>
      );
    }
    render(<Harness />);
    expect(screen.getByText("Body One")).toBeInTheDocument();
    expect(screen.queryByText("Body Two")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByText("Body Two")).toBeInTheDocument();
    expect(screen.queryByText("Body One")).toBeNull();
  });
});

describe("Table primitives", () => {
  it("renders a semantic table", () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>Acme</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("has hairline separators", () => {
    const { container } = render(
      <Table>
        <TBody>
          <TR><TD>Row 1</TD></TR>
          <TR><TD>Row 2</TD></TR>
        </TBody>
      </Table>,
    );
    const tbody = container.querySelector("tbody");
    expect(tbody).toHaveClass("divide-y");
    expect(tbody).toHaveClass("divide-white/[0.06]");
  });

  it("has subtle hover state on rows", () => {
    const { container } = render(
      <Table>
        <TBody>
          <TR><TD>Row 1</TD></TR>
        </TBody>
      </Table>,
    );
    const row = container.querySelector("tr");
    expect(row).toHaveClass("hover:bg-white/[0.02]");
  });
});

describe("StatusBadge", () => {
  it("renders the provided label", () => {
    render(<StatusBadge status="approved" label="Aprobado" />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });
});
