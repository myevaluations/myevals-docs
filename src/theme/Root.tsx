import React from 'react';
import AskTheDocs from '@site/src/components/AskTheDocs';

interface RootProps {
  children: React.ReactNode;
}

// Docusaurus theme swizzle: Root component wraps the entire site.
// Adding AskTheDocs here renders the floating chat button on every page.
export default function Root({ children }: RootProps): React.JSX.Element {
  return (
    <>
      {children}
      <AskTheDocs />
    </>
  );
}
