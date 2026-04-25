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
});

describe("StatusBadge", () => {
  it("renders the provided label", () => {
    render(<StatusBadge status="approved" label="Aprobado" />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });
});
